import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "#/db";
import {
	attendance,
	attendanceIssue,
	employee,
	leaveRequest,
	member,
	organization,
} from "#/db/schema";
import { deriveIssues } from "./leave";
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
import { getCurrentSession, getOrgMemberContext } from "./session";

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
		const context = await getOrgMemberContext();
		if (!context) {
			throw new Error("Unauthorized");
		}
		const isAdmin = ["owner", "admin"].includes(context.role ?? "");
		const isSupervisor = context.role === "supervisor";
		if (!isAdmin && !isSupervisor) {
			throw new Error("Forbidden");
		}
		let employeeIds: string[] | null = null;
		if (!isAdmin && context.employee) {
			const subordinates = await getDb()
				.select({ id: employee.id })
				.from(employee)
				.where(
					and(
						eq(employee.organizationId, context.orgId),
						eq(employee.supervisorId, context.employee.id),
					),
				);
			employeeIds = subordinates.map((row) => row.id);
		}
		const employeeList = await getDb()
			.select({
				id: employee.id,
				name: employee.name,
				employeeNo: employee.employeeNo,
				shift: employee.shift,
			})
			.from(employee)
			.where(
				employeeIds
					? inArray(employee.id, employeeIds)
					: eq(employee.organizationId, context.orgId),
			)
			.orderBy(employee.employeeNo);
		const records = await getDb()
			.select()
			.from(attendance)
			.where(
				and(
					eq(attendance.organizationId, context.orgId),
					eq(attendance.date, data.date),
				),
			);
		const recordsByEmployee = new Map(
			records.map((record) => [record.employeeId, record]),
		);
		return {
			employees: employeeList,
			rows: employeeList.map((emp) => ({
				employee: emp,
				record: recordsByEmployee.get(emp.id) ?? null,
			})),
			scope: isAdmin ? ("all" as const) : ("subordinates" as const),
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
// --- Attendance issues (late / short / missing_out / absent) ---

async function requireIssueApprover(): Promise<
	{ scope: "all" } | { scope: "subordinates"; employeeIds: string[] } | null
> {
	const context = await getOrgMemberContext();
	if (!context) {
		return null;
	}
	if (["owner", "admin"].includes(context.role ?? "")) {
		return { scope: "all" };
	}
	if (context.role !== "supervisor" || !context.employee) {
		return null;
	}
	const subordinates = await getDb()
		.select({ id: employee.id })
		.from(employee)
		.where(
			and(
				eq(employee.organizationId, context.orgId),
				eq(employee.supervisorId, context.employee.id),
			),
		);
	return {
		scope: "subordinates",
		employeeIds: subordinates.map((row) => row.id),
	};
}

async function syncIssues(options: {
	orgId: string;
	employeeIds: string[];
	workDays: number[];
	timezone: string;
}): Promise<void> {
	if (options.employeeIds.length === 0) {
		return;
	}
	const now = new Date();
	const today = formatZonedDate(now, options.timezone);
	const monthStart = `${today.slice(0, 7)}-01`;
	const records = await getDb()
		.select({
			employeeId: attendance.employeeId,
			date: attendance.date,
			clockInStatus: attendance.clockInStatus,
			clockOutStatus: attendance.clockOutStatus,
			clockOut: attendance.clockOut,
		})
		.from(attendance)
		.where(
			and(
				inArray(attendance.employeeId, options.employeeIds),
				eq(attendance.organizationId, options.orgId),
			),
		);
	const relevant = records.filter(
		(record) => record.date >= monthStart && record.date < today,
	);
	const approvedLeave = await getDb()
		.select({
			employeeId: leaveRequest.employeeId,
			startDate: leaveRequest.startDate,
			endDate: leaveRequest.endDate,
		})
		.from(leaveRequest)
		.where(
			and(
				inArray(leaveRequest.employeeId, options.employeeIds),
				eq(leaveRequest.status, "approved"),
			),
		);
	const leaveCovered = new Set<string>();
	for (const request of approvedLeave) {
		let cursor = request.startDate;
		while (cursor <= request.endDate) {
			if (cursor >= monthStart) {
				leaveCovered.add(`${request.employeeId}:${cursor}`);
			}
			const [year, month, day] = cursor.split("-").map(Number);
			cursor = new Date(Date.UTC(year, month - 1, day + 1))
				.toISOString()
				.slice(0, 10);
		}
	}
	const recordsByEmployee = new Map<string, typeof relevant>();
	for (const record of relevant) {
		const list = recordsByEmployee.get(record.employeeId) ?? [];
		list.push(record);
		recordsByEmployee.set(record.employeeId, list);
	}
	const derived: {
		organizationId: string;
		employeeId: string;
		date: string;
		type: string;
	}[] = [];
	for (const employeeId of options.employeeIds) {
		const derivedForEmployee = deriveIssues({
			records: recordsByEmployee.get(employeeId) ?? [],
			leaveCoveredDates: new Set(
				[...leaveCovered]
					.filter((key) => key.startsWith(`${employeeId}:`))
					.map((key) => key.split(":")[1]),
			),
			workDays: options.workDays,
			rangeStart: monthStart,
			rangeEnd: today,
			today,
		});
		for (const issue of derivedForEmployee) {
			derived.push({
				organizationId: options.orgId,
				employeeId,
				date: issue.date,
				type: issue.type,
			});
		}
	}
	const existing = await getDb()
		.select({
			id: attendanceIssue.id,
			employeeId: attendanceIssue.employeeId,
			date: attendanceIssue.date,
			type: attendanceIssue.type,
			status: attendanceIssue.status,
		})
		.from(attendanceIssue)
		.where(
			and(
				eq(attendanceIssue.organizationId, options.orgId),
				inArray(attendanceIssue.employeeId, options.employeeIds),
			),
		);
	const derivedKeys = new Set(
		derived.map((issue) => `${issue.employeeId}:${issue.date}:${issue.type}`),
	);
	const existingKeys = new Set(
		existing.map((issue) => `${issue.employeeId}:${issue.date}:${issue.type}`),
	);
	const toInsert = derived.filter(
		(issue) =>
			!existingKeys.has(`${issue.employeeId}:${issue.date}:${issue.type}`),
	);
	if (toInsert.length > 0) {
		await getDb()
			.insert(attendanceIssue)
			.values(
				toInsert.map((issue) => ({
					id: crypto.randomUUID(),
					organizationId: issue.organizationId,
					employeeId: issue.employeeId,
					date: issue.date,
					type: issue.type,
					justification: null,
					status: "open",
					createdAt: now,
					updatedAt: now,
				})),
			);
	}
	const stale = existing.filter(
		(issue) =>
			issue.status === "open" &&
			!derivedKeys.has(`${issue.employeeId}:${issue.date}:${issue.type}`),
	);
	for (const issue of stale) {
		await getDb()
			.delete(attendanceIssue)
			.where(eq(attendanceIssue.id, issue.id));
	}
}

export const listMyIssues = createServerFn({ method: "GET" }).handler(
	async () => {
		const context = await getOrgMemberContext();
		if (!context?.employee) {
			return [];
		}
		await syncIssues({
			orgId: context.orgId,
			employeeIds: [context.employee.id],
			workDays: context.org.workDays.split(",").map(Number),
			timezone: context.org.timezone,
		});
		return getDb()
			.select()
			.from(attendanceIssue)
			.where(eq(attendanceIssue.employeeId, context.employee.id))
			.orderBy(desc(attendanceIssue.date));
	},
);

export const submitJustification = createServerFn({ method: "POST" })
	.validator((input: { issueId: string; justification: string }) => input)
	.handler(async ({ data }) => {
		const context = await getOrgMemberContext();
		if (!context) {
			throw new Error("Unauthorized");
		}
		const justification = data.justification.trim();
		if (justification.length < 5) {
			return {
				ok: false as const,
				reason: "Justification must be at least 5 characters",
			};
		}
		const [issue] = await getDb()
			.select({
				id: attendanceIssue.id,
				employeeId: attendanceIssue.employeeId,
				status: attendanceIssue.status,
			})
			.from(attendanceIssue)
			.where(eq(attendanceIssue.id, data.issueId))
			.limit(1);
		if (!issue || issue.employeeId === null) {
			return { ok: false as const, reason: "Issue not found" };
		}
		const isAdmin = ["owner", "admin"].includes(context.role ?? "");
		const isOwn = context.employee?.id === issue.employeeId;
		if (!isOwn && !isAdmin) {
			return { ok: false as const, reason: "Forbidden" };
		}
		if (!["open", "pending", "rejected"].includes(issue.status)) {
			return {
				ok: false as const,
				reason: "This issue can no longer be justified",
			};
		}
		await getDb()
			.update(attendanceIssue)
			.set({
				justification,
				status: "pending",
				verifiedBy: null,
				verifiedAt: null,
				updatedAt: new Date(),
			})
			.where(eq(attendanceIssue.id, data.issueId));
		return { ok: true as const };
	});

export const listIssuesForReview = createServerFn({ method: "GET" }).handler(
	async () => {
		const scope = await requireIssueApprover();
		if (!scope) {
			return { issues: [], scope: "none" as const };
		}
		const context = (await getOrgMemberContext())!;
		const employeeIds =
			scope.scope === "all"
				? (
						await getDb()
							.select({ id: employee.id })
							.from(employee)
							.where(eq(employee.organizationId, context.orgId))
					).map((row) => row.id)
				: scope.employeeIds;
		if (employeeIds.length === 0) {
			return { issues: [], scope: scope.scope };
		}
		await syncIssues({
			orgId: context.orgId,
			employeeIds,
			workDays: context.org.workDays.split(",").map(Number),
			timezone: context.org.timezone,
		});
		const issues = await getDb()
			.select({
				id: attendanceIssue.id,
				employeeId: attendanceIssue.employeeId,
				employeeName: employee.name,
				employeeNo: employee.employeeNo,
				date: attendanceIssue.date,
				type: attendanceIssue.type,
				justification: attendanceIssue.justification,
				status: attendanceIssue.status,
			})
			.from(attendanceIssue)
			.innerJoin(employee, eq(attendanceIssue.employeeId, employee.id))
			.where(inArray(attendanceIssue.employeeId, employeeIds))
			.orderBy(desc(attendanceIssue.date));
		return { issues, scope: scope.scope };
	},
);

export const verifyIssue = createServerFn({ method: "POST" })
	.validator(
		(input: { issueId: string; decision: "verified" | "rejected" }) => input,
	)
	.handler(async ({ data }) => {
		const context = await getOrgMemberContext();
		if (!context) {
			throw new Error("Unauthorized");
		}
		const scope = await requireIssueApprover();
		if (!scope) {
			return { ok: false as const, reason: "Forbidden" };
		}
		const [issue] = await getDb()
			.select({
				id: attendanceIssue.id,
				employeeId: attendanceIssue.employeeId,
				organizationId: attendanceIssue.organizationId,
				status: attendanceIssue.status,
			})
			.from(attendanceIssue)
			.where(eq(attendanceIssue.id, data.issueId))
			.limit(1);
		if (!issue || issue.organizationId !== context.orgId) {
			return { ok: false as const, reason: "Issue not found" };
		}
		if (
			scope.scope === "subordinates" &&
			!scope.employeeIds.includes(issue.employeeId)
		) {
			return {
				ok: false as const,
				reason: "This issue belongs to another supervisor's team",
			};
		}
		if (context.employee?.id === issue.employeeId) {
			return {
				ok: false as const,
				reason: "You cannot verify your own attendance issue",
			};
		}
		if (issue.status !== "pending") {
			return {
				ok: false as const,
				reason: "This issue has no pending justification",
			};
		}
		await getDb()
			.update(attendanceIssue)
			.set({
				status: data.decision,
				verifiedBy: context.session.user.id,
				verifiedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(attendanceIssue.id, data.issueId));
		return { ok: true as const };
	});
