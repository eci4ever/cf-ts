import { createServerFn } from "@tanstack/react-start";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "#/db";
import { attendance, employee, leaveRequest } from "#/db/schema";
import { enumerateDays } from "./leave";
import { formatZonedDate } from "./schedule";
import { getOrgMemberContext } from "./session";

export const getOrgDashboardStats = createServerFn({ method: "GET" }).handler(
	async () => {
		const context = await getOrgMemberContext();
		if (!context) {
			throw new Error("Unauthorized");
		}
		const isAdmin = ["owner", "admin"].includes(context.role ?? "");
		const isSupervisor = context.role === "supervisor";
		if (!isAdmin && !isSupervisor) {
			return null;
		}
		if (!isAdmin && !context.employee) {
			return {
				presentToday: 0,
				onLeaveToday: 0,
				lateToday: 0,
				totalEmployees: 0,
			};
		}

		const today = formatZonedDate(new Date(), context.org.timezone);
		const [year, month, day] = today.split("-").map(Number);
		const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
		const isWorkDay = context.org.workDays
			.split(",")
			.map(Number)
			.includes(weekday);

		const scopeWhere = isAdmin
			? and(
					eq(employee.organizationId, context.orgId),
					eq(employee.isActive, true),
				)
			: and(
					eq(employee.organizationId, context.orgId),
					eq(employee.supervisorId, context.employee?.id ?? ""),
					eq(employee.isActive, true),
				);
		const targets = await getDb()
			.select({ id: employee.id })
			.from(employee)
			.where(scopeWhere);
		const targetIds = targets.map((row) => row.id);
		const totalEmployees = targetIds.length;

		let presentToday = 0;
		let lateToday = 0;
		if (targetIds.length > 0) {
			const records = await getDb()
				.select({
					employeeId: attendance.employeeId,
					clockInStatus: attendance.clockInStatus,
				})
				.from(attendance)
				.where(
					and(
						eq(attendance.organizationId, context.orgId),
						eq(attendance.date, today),
						inArray(attendance.employeeId, targetIds),
					),
				);
			presentToday = records.length;
			lateToday = records.filter((row) => row.clockInStatus === "late").length;
		}

		let onLeaveToday = 0;
		if (targetIds.length > 0 && isWorkDay) {
			const leaves = await getDb()
				.select({ employeeId: leaveRequest.employeeId })
				.from(leaveRequest)
				.where(
					and(
						eq(leaveRequest.organizationId, context.orgId),
						eq(leaveRequest.status, "approved"),
						inArray(leaveRequest.employeeId, targetIds),
						lte(leaveRequest.startDate, today),
						gte(leaveRequest.endDate, today),
					),
				);
			onLeaveToday = new Set(leaves.map((row) => row.employeeId)).size;
		}

		return { presentToday, onLeaveToday, lateToday, totalEmployees };
	},
);

export const getOrgAttendanceTrend = createServerFn({ method: "GET" }).handler(
	async () => {
		const context = await getOrgMemberContext();
		if (!context) {
			throw new Error("Unauthorized");
		}
		const isAdmin = ["owner", "admin"].includes(context.role ?? "");
		const isSupervisor = context.role === "supervisor";
		if (!isAdmin && !isSupervisor) {
			return null;
		}
		if (!isAdmin && !context.employee) {
			return { weeks: [] };
		}
		const workDays = context.org.workDays.split(",").map(Number);
		const today = formatZonedDate(new Date(), context.org.timezone);
		const [year, month, day] = today.split("-").map(Number);
		const todayUtc = Date.UTC(year, month - 1, day);
		const DAY_MS = 86_400_000;

		const scopeWhere = isAdmin
			? and(
					eq(employee.organizationId, context.orgId),
					eq(employee.isActive, true),
				)
			: and(
					eq(employee.organizationId, context.orgId),
					eq(employee.supervisorId, context.employee?.id ?? ""),
					eq(employee.isActive, true),
				);
		const targets = await getDb()
			.select({ id: employee.id })
			.from(employee)
			.where(scopeWhere);
		const targetIds = targets.map((row) => row.id);
		if (targetIds.length === 0) {
			return { weeks: [] };
		}

		const WEEKS = 6;
		const currentWeekStartUtc =
			todayUtc - ((new Date(todayUtc).getUTCDay() + 6) % 7) * DAY_MS;
		const rangeStartUtc = currentWeekStartUtc - (WEEKS - 1) * 7 * DAY_MS;
		const rangeStart = new Date(rangeStartUtc).toISOString().slice(0, 10);

		const records = await getDb()
			.select({
				date: attendance.date,
				clockInStatus: attendance.clockInStatus,
			})
			.from(attendance)
			.where(
				and(
					eq(attendance.organizationId, context.orgId),
					inArray(attendance.employeeId, targetIds),
					gte(attendance.date, rangeStart),
					lte(attendance.date, today),
				),
			);

		const leaves = await getDb()
			.select({
				employeeId: leaveRequest.employeeId,
				startDate: leaveRequest.startDate,
				endDate: leaveRequest.endDate,
			})
			.from(leaveRequest)
			.where(
				and(
					eq(leaveRequest.organizationId, context.orgId),
					eq(leaveRequest.status, "approved"),
					inArray(leaveRequest.employeeId, targetIds),
					lte(leaveRequest.startDate, today),
					gte(leaveRequest.endDate, rangeStart),
				),
			);
		const leaveDates: string[] = [];
		for (const leave of leaves) {
			const start =
				leave.startDate < rangeStart ? rangeStart : leave.startDate;
			const end = leave.endDate > today ? today : leave.endDate;
			leaveDates.push(...enumerateDays(start, end));
		}

		const weeks: {
			weekStart: string;
			rate: number | null;
			present: number;
			late: number;
		}[] = [];
		for (let index = 0; index < WEEKS; index += 1) {
			const weekStartUtc = rangeStartUtc + index * 7 * DAY_MS;
			if (weekStartUtc > todayUtc) {
				break;
			}
			const weekEndUtc = Math.min(weekStartUtc + 6 * DAY_MS, todayUtc);
			const weekStart = new Date(weekStartUtc).toISOString().slice(0, 10);
			const weekEnd = new Date(weekEndUtc).toISOString().slice(0, 10);

			let expected = 0;
			for (let t = weekStartUtc; t <= weekEndUtc; t += DAY_MS) {
				if (workDays.includes(new Date(t).getUTCDay())) {
					expected += targetIds.length;
				}
			}
			let leaveDays = 0;
			for (const date of leaveDates) {
				if (date >= weekStart && date <= weekEnd) {
					const t = Date.UTC(
						Number(date.slice(0, 4)),
						Number(date.slice(5, 7)) - 1,
						Number(date.slice(8, 10)),
					);
					if (workDays.includes(new Date(t).getUTCDay())) {
						leaveDays += 1;
					}
				}
			}
			const denominator = Math.max(expected - leaveDays, 0);

			const inWeek = records.filter(
				(record) => record.date >= weekStart && record.date <= weekEnd,
			);
			const late = inWeek.filter(
				(record) => record.clockInStatus === "late",
			).length;
			const rate =
				denominator > 0
					? Math.round((inWeek.length / denominator) * 100)
					: null;
			weeks.push({ weekStart, rate, present: inWeek.length, late });
		}
		return { weeks };
	},
);
