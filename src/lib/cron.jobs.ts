import { and, eq, inArray, lte } from "drizzle-orm";
import { getDb } from "#/db";
import {
	attendance,
	cronState,
	employee,
	leaveRequest,
	organization,
} from "#/db/schema";
import { syncIssues } from "./attendance-sync";
import { notifyEmployee } from "./notify";
import { formatZonedDate, getZonedParts, resolveSchedule } from "./schedule";

const TICK_MINUTES = 15;
const CLOCK_OUT_REMINDER_AFTER_MINUTES = 30;

async function getState(key: string): Promise<string | null> {
	const [row] = await getDb()
		.select({ value: cronState.value })
		.from(cronState)
		.where(eq(cronState.key, key))
		.limit(1);
	return row?.value ?? null;
}

async function setState(key: string, value = "1"): Promise<void> {
	await getDb()
		.insert(cronState)
		.values({ key, value, updatedAt: new Date() })
		.onConflictDoUpdate({
			target: cronState.key,
			set: { value, updatedAt: new Date() },
		});
}

/**
 * Nightly absent sweep — derives attendance issues for the current month for
 * every org once per day, so absences are recorded even when nobody opens the
 * app. On the 1st of a month it sweeps yesterday's month instead, covering the
 * previous month's final day. Idempotent via the attendance_issue unique index.
 */
async function runAbsentSweep(now: Date): Promise<number> {
	const db = getDb();
	const orgs = await db.select().from(organization);
	let swept = 0;
	for (const org of orgs) {
		const today = formatZonedDate(now, org.timezone);
		const stateKey = `sweep:${org.id}:${today}`;
		if ((await getState(stateKey)) !== null) {
			continue;
		}
		const activeEmployees = await db
			.select({
				id: employee.id,
				workDays: employee.workDays,
				workStartMinutes: employee.workStartMinutes,
				workEndMinutes: employee.workEndMinutes,
				graceMinutes: employee.graceMinutes,
			})
			.from(employee)
			.where(
				and(eq(employee.organizationId, org.id), eq(employee.isActive, true)),
			);
		if (activeEmployees.length > 0) {
			const monthStart =
				today.slice(8) === "01"
					? // 1st of the month — sweep the previous month's last day too
						new Date(
							Date.UTC(
								Number(today.slice(0, 4)),
								Number(today.slice(5, 7)) - 2,
								1,
							),
						)
							.toISOString()
							.slice(0, 7) + "-01"
					: undefined;
			await syncIssues({
				orgId: org.id,
				employeeIds: activeEmployees.map((row) => row.id),
				workDays: org.workDays.split(",").map(Number),
				overrides: new Map(
					activeEmployees.map((row) => [
						row.id,
						{
							workDays: row.workDays,
							workStartMinutes: row.workStartMinutes,
							workEndMinutes: row.workEndMinutes,
							graceMinutes: row.graceMinutes,
						},
					]),
				),
				timezone: org.timezone,
				monthStart,
			});
		}
		await setState(stateKey);
		swept++;
	}
	return swept;
}

/**
 * Reminders fire on the 15-minute tick that lands in each org's window:
 * clock-in at grace end (workStart + grace), clock-out at workEnd + 30.
 * Deduplicated per employee per day via cron_state.
 */
async function runReminders(
	now: Date,
): Promise<{ clockIn: number; clockOut: number }> {
	const db = getDb();
	const orgs = await db.select().from(organization);
	let clockInSent = 0;
	let clockOutSent = 0;
	for (const org of orgs) {
		const parts = getZonedParts(now, org.timezone);
		const today = formatZonedDate(now, org.timezone);

		const employees = await db
			.select({
				id: employee.id,
				userId: employee.userId,
				workDays: employee.workDays,
				workStartMinutes: employee.workStartMinutes,
				workEndMinutes: employee.workEndMinutes,
				graceMinutes: employee.graceMinutes,
			})
			.from(employee)
			.where(
				and(eq(employee.organizationId, org.id), eq(employee.isActive, true)),
			);
		if (employees.length === 0) {
			continue;
		}
		// each employee's reminder windows follow their resolved schedule, so
		// one tick can hit different employees' windows
		const scheduled = employees
			.map((row) => ({
				row,
				schedule: resolveSchedule(row, org),
			}))
			.filter(({ schedule }) => schedule.workDays.includes(parts.weekday))
			.map(({ row, schedule }) => ({
				row,
				schedule,
				clockIn: {
					from: schedule.workStartMinutes + schedule.graceMinutes,
					to: schedule.workStartMinutes + schedule.graceMinutes + TICK_MINUTES,
				},
				clockOut: {
					from: schedule.workEndMinutes + CLOCK_OUT_REMINDER_AFTER_MINUTES,
					to:
						schedule.workEndMinutes + CLOCK_OUT_REMINDER_AFTER_MINUTES + TICK_MINUTES,
				},
			}))
			.filter(
				({ clockIn, clockOut }) =>
					(parts.minutesSinceMidnight >= clockIn.from &&
						parts.minutesSinceMidnight < clockIn.to) ||
					(parts.minutesSinceMidnight >= clockOut.from &&
						parts.minutesSinceMidnight < clockOut.to),
			);
		if (scheduled.length === 0) {
			continue;
		}
		const employeeIds = scheduled.map(({ row }) => row.id);

		const records = await db
			.select({
				employeeId: attendance.employeeId,
				clockIn: attendance.clockIn,
				clockOut: attendance.clockOut,
			})
			.from(attendance)
			.where(
				and(
					eq(attendance.organizationId, org.id),
					eq(attendance.date, today),
					inArray(attendance.employeeId, employeeIds),
				),
			);
		const clockedIn = new Set(
			records.filter((row) => row.clockIn).map((row) => row.employeeId),
		);
		const clockedOut = new Set(
			records.filter((row) => row.clockOut).map((row) => row.employeeId),
		);

		const leaveRows = await db
			.select({
				employeeId: leaveRequest.employeeId,
				startDate: leaveRequest.startDate,
				endDate: leaveRequest.endDate,
			})
			.from(leaveRequest)
			.where(
				and(
					eq(leaveRequest.status, "approved"),
					lte(leaveRequest.startDate, today),
					inArray(leaveRequest.employeeId, employeeIds),
				),
			);
		const onLeave = new Set(
			leaveRows
				.filter((row) => row.endDate >= today)
				.map((row) => row.employeeId),
		);

		for (const { row: employee, clockIn, clockOut } of scheduled) {
			if (!employee.userId || onLeave.has(employee.id)) {
				continue;
			}
			const inClockInWindow =
				parts.minutesSinceMidnight >= clockIn.from &&
				parts.minutesSinceMidnight < clockIn.to;
			const inClockOutWindow =
				parts.minutesSinceMidnight >= clockOut.from &&
				parts.minutesSinceMidnight < clockOut.to;
			if (
				inClockInWindow &&
				!clockedIn.has(employee.id) &&
				(await getState(`r:in:${employee.id}:${today}`)) === null
			) {
				await notifyEmployee(
					org.id,
					employee.id,
					"Clock-in reminder",
					`<p>You haven't clocked in yet today. You are now past the grace period, so today may be marked <strong>late</strong>.</p>`,
					"/attendance",
					"You haven't clocked in yet today",
				);
				await setState(`r:in:${employee.id}:${today}`);
				clockInSent++;
			}
			if (
				inClockOutWindow &&
				clockedIn.has(employee.id) &&
				!clockedOut.has(employee.id) &&
				(await getState(`r:out:${employee.id}:${today}`)) === null
			) {
				await notifyEmployee(
					org.id,
					employee.id,
					"Clock-out reminder",
					`<p>You clocked in today but haven't clocked out yet. Remember to clock out so your hours are recorded.</p>`,
					"/attendance",
					"You haven't clocked out yet today",
				);
				await setState(`r:out:${employee.id}:${today}`);
				clockOutSent++;
			}
		}
	}
	return { clockIn: clockInSent, clockOut: clockOutSent };
}

export async function runCron(now = new Date()): Promise<{
	sweepOrgs: number;
	clockIn: number;
	clockOut: number;
}> {
	const sweepOrgs = await runAbsentSweep(now);
	const reminders = await runReminders(now);
	return { sweepOrgs, ...reminders };
}
