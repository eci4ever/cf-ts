import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "#/db";
import { attendance, employee, member, organization } from "#/db/schema";
import {
	type ClockInStatus,
	type ClockOutStatus,
	computeClockInStatus,
	computeClockOutStatus,
	computeTargetClockOut,
	formatZonedDate,
	parseTimeToMinutes,
	type Schedule,
	type Shift,
	zonedWallTimeToUtc,
} from "./schedule";
import { getCurrentSession } from "./session";

type OrgRow = {
	id: string;
	workDays: string;
	workStartMinutes: number;
	workEndMinutes: number;
	graceMinutes: number;
	timezone: string;
};

function scheduleFromOrg(org: OrgRow): Schedule {
	return {
		workDays: org.workDays.split(",").map(Number),
		workStartMinutes: org.workStartMinutes,
		workEndMinutes: org.workEndMinutes,
		graceMinutes: org.graceMinutes,
		timezone: org.timezone,
	};
}

async function getOrgAndEmployee() {
	const session = await getCurrentSession();
	if (!session) {
		throw new Error("Unauthorized");
	}
	const orgId = session.session.activeOrganizationId;
	if (!orgId) {
		throw new Error("No active organization");
	}
	const [org] = await getDb()
		.select()
		.from(organization)
		.where(eq(organization.id, orgId))
		.limit(1);
	if (!org) {
		throw new Error("Organization not found");
	}
	const [linked] = await getDb()
		.select({
			id: employee.id,
			name: employee.name,
			shift: employee.shift,
			isActive: employee.isActive,
		})
		.from(employee)
		.where(
			and(
				eq(employee.organizationId, orgId),
				eq(employee.userId, session.user.id),
			),
		)
		.limit(1);
	return {
		session,
		org,
		schedule: scheduleFromOrg(org),
		employee: linked && linked.isActive ? linked : null,
	};
}

async function requireOrgAdminForAttendance() {
	const session = await getCurrentSession();
	if (!session) {
		throw new Error("Unauthorized");
	}
	const orgId = session.session.activeOrganizationId;
	if (!orgId) {
		throw new Error("No active organization");
	}
	if (session.user.role?.split(",").includes("admin")) {
		return { session, orgId };
	}
	const [memberRow] = await getDb()
		.select({ role: member.role })
		.from(member)
		.where(
			and(eq(member.organizationId, orgId), eq(member.userId, session.user.id)),
		)
		.limit(1);
	if (!memberRow?.role || !["owner", "admin"].includes(memberRow.role)) {
		throw new Error("Forbidden");
	}
	return { session, orgId };
}

export const getTodayAttendance = createServerFn({ method: "GET" }).handler(
	async () => {
		const { schedule, employee: linked } = await getOrgAndEmployee();
		const now = new Date();
		const today = formatZonedDate(now, schedule.timezone);
		let record = null;
		let targetClockOut: Date | null = null;
		if (linked) {
			const [row] = await getDb()
				.select()
				.from(attendance)
				.where(
					and(eq(attendance.employeeId, linked.id), eq(attendance.date, today)),
				)
				.limit(1);
			if (row) {
				record = row;
				if (!row.clockOut) {
					targetClockOut = computeTargetClockOut(
						row.clockIn,
						schedule,
						linked.shift as Shift,
					);
				}
			}
		}
		return {
			schedule,
			employee: linked
				? { id: linked.id, name: linked.name, shift: linked.shift as Shift }
				: null,
			today,
			record,
			targetClockOut,
		};
	},
);

export const clockIn = createServerFn({ method: "POST" }).handler(async () => {
	const { org, schedule, employee: linked } = await getOrgAndEmployee();
	if (!linked) {
		return {
			ok: false as const,
			reason: "Your account is not linked to an active employee record",
		};
	}
	const now = new Date();
	const today = formatZonedDate(now, schedule.timezone);
	const [existing] = await getDb()
		.select({ id: attendance.id })
		.from(attendance)
		.where(
			and(eq(attendance.employeeId, linked.id), eq(attendance.date, today)),
		)
		.limit(1);
	if (existing) {
		return { ok: false as const, reason: "You have already clocked in today" };
	}
	const status = computeClockInStatus(now, schedule, linked.shift as Shift);
	const [record] = await getDb()
		.insert(attendance)
		.values({
			id: crypto.randomUUID(),
			organizationId: org.id,
			employeeId: linked.id,
			date: today,
			clockIn: now,
			clockInStatus: status,
			clockOut: null,
			clockOutStatus: null,
			note: null,
			createdAt: now,
			updatedAt: now,
		})
		.returning();
	return { ok: true as const, record };
});

export const clockOut = createServerFn({ method: "POST" }).handler(async () => {
	const { schedule, employee: linked } = await getOrgAndEmployee();
	if (!linked) {
		return {
			ok: false as const,
			reason: "Your account is not linked to an active employee record",
		};
	}
	const now = new Date();
	const today = formatZonedDate(now, schedule.timezone);
	const [record] = await getDb()
		.select()
		.from(attendance)
		.where(
			and(eq(attendance.employeeId, linked.id), eq(attendance.date, today)),
		)
		.limit(1);
	if (!record) {
		return { ok: false as const, reason: "No clock-in record for today" };
	}
	if (record.clockOut) {
		return { ok: false as const, reason: "You have already clocked out today" };
	}
	const target = computeTargetClockOut(
		record.clockIn,
		schedule,
		linked.shift as Shift,
	);
	const status = computeClockOutStatus(now, target);
	await getDb()
		.update(attendance)
		.set({ clockOut: now, clockOutStatus: status, updatedAt: now })
		.where(eq(attendance.id, record.id));
	return { ok: true as const, status };
});

export const listMyAttendance = createServerFn({ method: "GET" }).handler(
	async () => {
		const { employee: linked } = await getOrgAndEmployee();
		if (!linked) {
			return [];
		}
		return getDb()
			.select()
			.from(attendance)
			.where(eq(attendance.employeeId, linked.id))
			.orderBy(desc(attendance.date))
			.limit(30);
	},
);

export const adminListAttendance = createServerFn({ method: "GET" })
	.validator((input: { date: string }) => input)
	.handler(async ({ data }) => {
		const { orgId } = await requireOrgAdminForAttendance();
		const employees = await getDb()
			.select({
				id: employee.id,
				name: employee.name,
				employeeNo: employee.employeeNo,
				shift: employee.shift,
			})
			.from(employee)
			.where(eq(employee.organizationId, orgId))
			.orderBy(employee.employeeNo);
		const records = await getDb()
			.select()
			.from(attendance)
			.where(
				and(
					eq(attendance.organizationId, orgId),
					eq(attendance.date, data.date),
				),
			);
		const recordsByEmployee = new Map(
			records.map((record) => [record.employeeId, record]),
		);
		return {
			employees,
			rows: employees.map((emp) => ({
				employee: emp,
				record: recordsByEmployee.get(emp.id) ?? null,
			})),
		};
	});

export const adminUpsertAttendance = createServerFn({ method: "POST" })
	.validator(
		(input: {
			employeeId: string;
			date: string;
			clockInTime: string;
			clockOutTime?: string;
			note?: string;
		}) => input,
	)
	.handler(async ({ data }) => {
		const { orgId } = await requireOrgAdminForAttendance();
		const clockInMinutes = parseTimeToMinutes(data.clockInTime);
		if (clockInMinutes === null) {
			return {
				ok: false as const,
				reason: "Invalid clock-in time (use HH:MM)",
			};
		}
		let clockOutMinutes: number | null = null;
		if (data.clockOutTime) {
			clockOutMinutes = parseTimeToMinutes(data.clockOutTime);
			if (clockOutMinutes === null) {
				return {
					ok: false as const,
					reason: "Invalid clock-out time (use HH:MM)",
				};
			}
		}
		if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
			return { ok: false as const, reason: "Invalid date" };
		}
		const [emp] = await getDb()
			.select({ id: employee.id, shift: employee.shift })
			.from(employee)
			.where(
				and(
					eq(employee.id, data.employeeId),
					eq(employee.organizationId, orgId),
				),
			)
			.limit(1);
		if (!emp) {
			return { ok: false as const, reason: "Employee not found" };
		}
		const [org] = await getDb()
			.select()
			.from(organization)
			.where(eq(organization.id, orgId))
			.limit(1);
		const schedule = scheduleFromOrg(org);
		const clockIn = zonedWallTimeToUtc(
			data.date,
			clockInMinutes,
			schedule.timezone,
		);
		const clockInStatus: ClockInStatus = computeClockInStatus(
			clockIn,
			schedule,
			emp.shift as Shift,
		);
		let clockOut: Date | null = null;
		let clockOutStatus: ClockOutStatus = null;
		if (clockOutMinutes !== null) {
			clockOut = zonedWallTimeToUtc(
				data.date,
				clockOutMinutes,
				schedule.timezone,
			);
			clockOutStatus = computeClockOutStatus(
				clockOut,
				computeTargetClockOut(clockIn, schedule, emp.shift as Shift),
			);
		}
		const note = data.note?.trim() || "Keyed in by admin";
		const now = new Date();
		const [existing] = await getDb()
			.select({ id: attendance.id })
			.from(attendance)
			.where(
				and(
					eq(attendance.employeeId, data.employeeId),
					eq(attendance.date, data.date),
				),
			)
			.limit(1);
		if (existing) {
			await getDb()
				.update(attendance)
				.set({
					clockIn,
					clockInStatus,
					clockOut,
					clockOutStatus,
					note,
					updatedAt: now,
				})
				.where(eq(attendance.id, existing.id));
			return { ok: true as const, updated: true };
		}
		await getDb().insert(attendance).values({
			id: crypto.randomUUID(),
			organizationId: orgId,
			employeeId: data.employeeId,
			date: data.date,
			clockIn,
			clockInStatus,
			clockOut,
			clockOutStatus,
			note,
			createdAt: now,
			updatedAt: now,
		});
		return { ok: true as const, updated: false };
	});
