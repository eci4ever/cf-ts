import { createServerFn } from "@tanstack/react-start";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { getDb } from "#/db";
import {
	employee,
	leaveRequest,
	leaveType,
	orgHoliday,
	organization,
} from "#/db/schema";
import { countWorkingDays, isValidDateKey, rangesOverlap } from "./leave";
import { getHolidayDates } from "./holidays";
import { notifyEmployee, notifySupervisors } from "./notify";
import { logAudit } from "./audit.functions";
import { getOrgMemberContext } from "./session";

async function getMemberContext() {
	return getOrgMemberContext();
}

async function requireMember() {
	const context = await getMemberContext();
	if (!context) {
		throw new Error("Unauthorized");
	}
	return context;
}

async function requireLeaveAdmin() {
	const context = await requireMember();
	if (!["owner", "admin"].includes(context.role ?? "")) {
		throw new Error("Forbidden");
	}
	return context;
}

async function seedLeaveTypes(orgId: string): Promise<void> {
	const [{ count }] = await getDb()
		.select({ count: sql<number>`count(*)` })
		.from(leaveType)
		.where(eq(leaveType.organizationId, orgId));
	if (Number(count) > 0) {
		return;
	}
	const now = new Date();
	await getDb()
		.insert(leaveType)
		.values([
			{
				id: crypto.randomUUID(),
				organizationId: orgId,
				name: "Annual",
				quotaDays: 14,
				createdAt: now,
			},
			{
				id: crypto.randomUUID(),
				organizationId: orgId,
				name: "Sick",
				quotaDays: 10,
				createdAt: now,
			},
			{
				id: crypto.randomUUID(),
				organizationId: orgId,
				name: "Unpaid",
				quotaDays: null,
				createdAt: now,
			},
		]);
}

export const listLeaveTypes = createServerFn({ method: "GET" }).handler(
	async () => {
		const { orgId } = await requireMember();
		await seedLeaveTypes(orgId);
		return getDb()
			.select()
			.from(leaveType)
			.where(eq(leaveType.organizationId, orgId))
			.orderBy(leaveType.name);
	},
);

export const createLeaveType = createServerFn({ method: "POST" })
	.validator((input: { name: string; quotaDays?: number | null }) => input)
	.handler(async ({ data }) => {
		const { orgId } = await requireLeaveAdmin();
		const name = data.name.trim();
		if (name.length < 2 || name.length > 40) {
			return { ok: false as const, reason: "Name must be 2–40 characters" };
		}
		const quotaDays =
			data.quotaDays === null || data.quotaDays === undefined
				? null
				: Math.round(Number(data.quotaDays));
		if (
			quotaDays !== null &&
			(!Number.isFinite(quotaDays) || quotaDays < 0 || quotaDays > 365)
		) {
			return {
				ok: false as const,
				reason: "Quota must be between 0 and 365, or empty for unlimited",
			};
		}
		const [existing] = await getDb()
			.select({ id: leaveType.id })
			.from(leaveType)
			.where(and(eq(leaveType.organizationId, orgId), eq(leaveType.name, name)))
			.limit(1);
		if (existing) {
			return {
				ok: false as const,
				reason: `Leave type "${name}" already exists`,
			};
		}
		await getDb().insert(leaveType).values({
			id: crypto.randomUUID(),
			organizationId: orgId,
			name,
			quotaDays,
			createdAt: new Date(),
		});
		return { ok: true as const };
	});

export const updateLeaveType = createServerFn({ method: "POST" })
	.validator(
		(input: { leaveTypeId: string; name: string; quotaDays?: number | null }) =>
			input,
	)
	.handler(async ({ data }) => {
		const { orgId } = await requireLeaveAdmin();
		const name = data.name.trim();
		if (name.length < 2 || name.length > 40) {
			return { ok: false as const, reason: "Name must be 2–40 characters" };
		}
		const quotaDays =
			data.quotaDays === null || data.quotaDays === undefined
				? null
				: Math.round(Number(data.quotaDays));
		if (
			quotaDays !== null &&
			(!Number.isFinite(quotaDays) || quotaDays < 0 || quotaDays > 365)
		) {
			return {
				ok: false as const,
				reason: "Quota must be between 0 and 365, or empty for unlimited",
			};
		}
		const [existing] = await getDb()
			.select({ id: leaveType.id })
			.from(leaveType)
			.where(and(eq(leaveType.organizationId, orgId), eq(leaveType.name, name)))
			.limit(1);
		if (existing && existing.id !== data.leaveTypeId) {
			return {
				ok: false as const,
				reason: `Leave type "${name}" already exists`,
			};
		}
		await getDb()
			.update(leaveType)
			.set({ name, quotaDays })
			.where(
				and(
					eq(leaveType.id, data.leaveTypeId),
					eq(leaveType.organizationId, orgId),
				),
			);
		return { ok: true as const };
	});

export const deleteLeaveType = createServerFn({ method: "POST" })
	.validator((input: { leaveTypeId: string }) => input)
	.handler(async ({ data }) => {
		const { orgId } = await requireLeaveAdmin();
		const [{ count }] = await getDb()
			.select({ count: sql<number>`count(*)` })
			.from(leaveRequest)
			.where(eq(leaveRequest.leaveTypeId, data.leaveTypeId));
		if (Number(count) > 0) {
			return {
				ok: false as const,
				reason: "This leave type has existing requests and cannot be deleted",
			};
		}
		await getDb()
			.delete(leaveType)
			.where(
				and(
					eq(leaveType.id, data.leaveTypeId),
					eq(leaveType.organizationId, orgId),
				),
			);
		return { ok: true as const };
	});

async function usedDaysForYear(
	employeeId: string,
	leaveTypeId: string,
	year: string,
	workDays: number[],
	holidayDates: Set<string>,
): Promise<number> {
	const rows = await getDb()
		.select({
			startDate: leaveRequest.startDate,
			endDate: leaveRequest.endDate,
		})
		.from(leaveRequest)
		.where(
			and(
				eq(leaveRequest.employeeId, employeeId),
				eq(leaveRequest.leaveTypeId, leaveTypeId),
				inArray(leaveRequest.status, ["pending", "approved"]),
			),
		);
	const yearStart = `${year}-01-01`;
	const yearEnd = `${year}-12-31`;
	let total = 0;
	for (const row of rows) {
		const start = row.startDate > yearStart ? row.startDate : yearStart;
		const end = row.endDate < yearEnd ? row.endDate : yearEnd;
		if (start > end) {
			continue;
		}
		total += countWorkingDays(start, end, workDays, holidayDates);
	}
	return total;
}

function todayKey(timezone: string): string {
	return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(
		new Date(),
	);
}

async function validateAndQuote(options: {
	employeeId: string;
	leaveTypeId: string;
	startDate: string;
	endDate: string;
	ignoreRequestId?: string;
}): Promise<{ ok: true; days: number } | { ok: false; reason: string }> {
	const { employeeId, leaveTypeId, startDate, endDate } = options;
	if (!isValidDateKey(startDate) || !isValidDateKey(endDate)) {
		return { ok: false, reason: "Invalid dates" };
	}
	if (startDate > endDate) {
		return { ok: false, reason: "Start date must be before end date" };
	}
	const orgId = (await getMemberContext())!.orgId;
	const [org] = await getDb()
		.select({ workDays: organization.workDays })
		.from(organization)
		.where(eq(organization.id, orgId))
		.limit(1);
	// day counting follows the applicant's own work days when overridden
	const [applicant] = await getDb()
		.select({ workDays: employee.workDays })
		.from(employee)
		.where(and(eq(employee.id, employeeId), eq(employee.organizationId, orgId)))
		.limit(1);
	const workDays = (applicant?.workDays ?? org.workDays)
		.split(",")
		.map(Number);
	const holidayDates = await getHolidayDates(orgId);
	const days = countWorkingDays(startDate, endDate, workDays, holidayDates);
	if (days <= 0) {
		return { ok: false, reason: "The selected range contains no working days" };
	}
	const [type] = await getDb()
		.select({ quotaDays: leaveType.quotaDays })
		.from(leaveType)
		.where(eq(leaveType.id, leaveTypeId))
		.limit(1);
	if (!type) {
		return { ok: false, reason: "Leave type not found" };
	}
	const existing = await getDb()
		.select({
			id: leaveRequest.id,
			startDate: leaveRequest.startDate,
			endDate: leaveRequest.endDate,
		})
		.from(leaveRequest)
		.where(
			and(
				eq(leaveRequest.employeeId, employeeId),
				inArray(leaveRequest.status, ["pending", "approved"]),
			),
		);
	for (const row of existing) {
		if (row.id === options.ignoreRequestId) {
			continue;
		}
		if (rangesOverlap(startDate, endDate, row.startDate, row.endDate)) {
			return {
				ok: false,
				reason: `Overlaps an existing request (${row.startDate} → ${row.endDate})`,
			};
		}
	}
	if (type.quotaDays !== null) {
		const startYear = Number(startDate.slice(0, 4));
		const endYear = Number(endDate.slice(0, 4));
		const parts: {
			year: string;
			portion: number;
			used: number;
			remaining: number;
		}[] = [];
		let overdrawn: string | null = null;
		for (let year = startYear; year <= endYear; year += 1) {
			const yearKey = String(year);
			const yearStart = `${yearKey}-01-01`;
			const yearEnd = `${yearKey}-12-31`;
			const portion = countWorkingDays(
				startDate > yearStart ? startDate : yearStart,
				endDate < yearEnd ? endDate : yearEnd,
				workDays,
				holidayDates,
			);
			if (portion <= 0) {
				continue;
			}
			const used = await usedDaysForYear(
				employeeId,
				leaveTypeId,
				yearKey,
				workDays,
				holidayDates,
			);
			parts.push({ year: yearKey, portion, used, remaining: type.quotaDays - used });
			if (portion > type.quotaDays - used) {
				overdrawn = yearKey;
			}
		}
		if (overdrawn) {
			const reason =
				parts.length === 1
					? `Insufficient balance — ${parts[0].used} of ${type.quotaDays} days used in ${overdrawn}`
					: `Insufficient balance — ${parts
							.map(
								(part) =>
									`${part.year}: needs ${part.portion}, ${Math.max(part.remaining, 0)} remaining`,
							)
							.join("; ")}`;
			return { ok: false, reason };
		}
	}
	return { ok: true, days };
}

export const getLeaveOverview = createServerFn({ method: "GET" }).handler(
	async () => {
		const context = await requireMember();
		await seedLeaveTypes(context.orgId);
		const types = await getDb()
			.select()
			.from(leaveType)
			.where(eq(leaveType.organizationId, context.orgId))
			.orderBy(leaveType.name);
		const year = todayKey(context.org.timezone).slice(0, 4);
		const workDays = (
			context.employee?.workDays ?? context.org.workDays
		)
			.split(",")
			.map(Number);
		const holidayDates = await getHolidayDates(context.orgId);
		const balances = [];
		for (const type of types) {
			const used = context.employee
				? await usedDaysForYear(
						context.employee.id,
						type.id,
						year,
						workDays,
						holidayDates,
					)
				: 0;
			balances.push({
				id: type.id,
				name: type.name,
				quotaDays: type.quotaDays,
				usedDays: used,
				remainingDays: type.quotaDays === null ? null : type.quotaDays - used,
			});
		}
		const requests = context.employee
			? await getDb()
					.select({
						id: leaveRequest.id,
						leaveTypeName: leaveType.name,
						startDate: leaveRequest.startDate,
						endDate: leaveRequest.endDate,
						days: leaveRequest.days,
						reason: leaveRequest.reason,
						status: leaveRequest.status,
						decisionReason: leaveRequest.decisionReason,
						createdAt: leaveRequest.createdAt,
					})
					.from(leaveRequest)
					.innerJoin(leaveType, eq(leaveRequest.leaveTypeId, leaveType.id))
					.where(eq(leaveRequest.employeeId, context.employee.id))
					.orderBy(desc(leaveRequest.createdAt))
					.limit(30)
			: [];
		return { balances, requests, canApply: context.employee !== null };
	},
);

export const applyLeave = createServerFn({ method: "POST" })
	.validator(
		(input: {
			employeeId?: string;
			leaveTypeId: string;
			startDate: string;
			endDate: string;
			reason: string;
		}) => input,
	)
	.handler(async ({ data }) => {
		const context = await requireMember();
		const isAdmin = ["owner", "admin"].includes(context.role ?? "");
		let employeeId: string | null = null;
		if (data.employeeId && isAdmin) {
			const [target] = await getDb()
				.select({ id: employee.id, isActive: employee.isActive })
				.from(employee)
				.where(
					and(
						eq(employee.id, data.employeeId),
						eq(employee.organizationId, context.orgId),
					),
				)
				.limit(1);
			if (!target || !target.isActive) {
				return { ok: false as const, reason: "Employee not found" };
			}
			employeeId = target.id;
		} else if (context.employee) {
			employeeId = context.employee.id;
		}
		if (!employeeId) {
			return {
				ok: false as const,
				reason: "Your account is not linked to an active employee record",
			};
		}
		if (!data.reason.trim()) {
			return { ok: false as const, reason: "Reason is required" };
		}
		const quote = await validateAndQuote({
			employeeId,
			leaveTypeId: data.leaveTypeId,
			startDate: data.startDate,
			endDate: data.endDate,
		});
		if (!quote.ok) {
			return { ok: false as const, reason: quote.reason };
		}
		const now = new Date();
		await getDb().insert(leaveRequest).values({
			id: crypto.randomUUID(),
			organizationId: context.orgId,
			employeeId,
			leaveTypeId: data.leaveTypeId,
			startDate: data.startDate,
			endDate: data.endDate,
			days: quote.days,
			reason: data.reason.trim(),
			status: "pending",
			createdAt: now,
			updatedAt: now,
		});
		const [applicant] = await getDb()
			.select({ name: employee.name })
			.from(employee)
			.where(eq(employee.id, employeeId))
			.limit(1);
		const [leaveTypeRow] = await getDb()
			.select({ name: leaveType.name })
			.from(leaveType)
			.where(eq(leaveType.id, data.leaveTypeId))
			.limit(1);
		await notifySupervisors(
			context.orgId,
			employeeId,
			`New leave request — ${applicant?.name ?? "An employee"}`,
			`
				<p><strong>${applicant?.name ?? "An employee"}</strong> applied for <strong>${leaveTypeRow?.name ?? "leave"}</strong>.</p>
				<p style="margin:8px 0;">${data.startDate} → ${data.endDate} (${quote.days} day${quote.days === 1 ? "" : "s"})</p>
				<p style="color:#555;">Reason: ${data.reason.trim()}</p>
			`,
			"/leave",
			`${applicant?.name ?? "An employee"} applied for ${leaveTypeRow?.name ?? "leave"} — ${data.startDate} → ${data.endDate} (${quote.days} day${quote.days === 1 ? "" : "s"})`,
		);
		await logAudit({
			organizationId: context.orgId,
			userId: context.session.user.id,
			action: "leave.applied",
			detail: `${leaveTypeRow?.name ?? "Leave"} ${data.startDate} → ${data.endDate}`,
		});
		return { ok: true as const, days: quote.days };
	});

export const cancelLeave = createServerFn({ method: "POST" })
	.validator((input: { requestId: string }) => input)
	.handler(async ({ data }) => {
		const context = await requireMember();
		const [request] = await getDb()
			.select({
				id: leaveRequest.id,
				employeeId: leaveRequest.employeeId,
				status: leaveRequest.status,
				startDate: leaveRequest.startDate,
			})
			.from(leaveRequest)
			.where(
				and(
					eq(leaveRequest.id, data.requestId),
					eq(leaveRequest.organizationId, context.orgId),
				),
			)
			.limit(1);
		if (!request) {
			return { ok: false as const, reason: "Request not found" };
		}
		const isAdmin = ["owner", "admin"].includes(context.role ?? "");
		const isOwn = context.employee?.id === request.employeeId;
		const today = todayKey(context.org.timezone);
		if (isOwn && request.status === "pending") {
			// applicant cancelling own pending request
		} else if (
			isAdmin &&
			(request.status === "pending" ||
				(request.status === "approved" && request.startDate >= today))
		) {
			// admin cancelling
		} else {
			return { ok: false as const, reason: "You cannot cancel this request" };
		}
		await getDb()
			.update(leaveRequest)
			.set({ status: "cancelled", updatedAt: new Date() })
			.where(eq(leaveRequest.id, data.requestId));
		return { ok: true as const };
	});

async function resolveSupervisorUserId(
	orgId: string,
	supervisorEmployeeId: string | null,
): Promise<string | null> {
	if (!supervisorEmployeeId) {
		return null;
	}
	const [supervisor] = await getDb()
		.select({ userId: employee.userId, isActive: employee.isActive })
		.from(employee)
		.where(
			and(
				eq(employee.id, supervisorEmployeeId),
				eq(employee.organizationId, orgId),
			),
		)
		.limit(1);
	if (!supervisor?.userId || !supervisor.isActive) {
		return null;
	}
	return supervisor.userId;
}

export const listApprovals = createServerFn({ method: "GET" }).handler(
	async () => {
		const context = await requireMember();
		const isAdmin = ["owner", "admin"].includes(context.role ?? "");
		const isSupervisor = context.role === "supervisor";
		if (!isAdmin && !isSupervisor) {
			return { requests: [], scope: "none" as const };
		}
		let subordinateIds: string[] | null = null;
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
			subordinateIds = subordinates.map((row) => row.id);
			if (subordinateIds.length === 0) {
				return { requests: [], scope: "supervisor" as const };
			}
		}
		const rows = await getDb()
			.select({
				id: leaveRequest.id,
				employeeName: employee.name,
				employeeNo: employee.employeeNo,
				leaveTypeName: leaveType.name,
				startDate: leaveRequest.startDate,
				endDate: leaveRequest.endDate,
				days: leaveRequest.days,
				reason: leaveRequest.reason,
				status: leaveRequest.status,
				createdAt: leaveRequest.createdAt,
			})
			.from(leaveRequest)
			.innerJoin(employee, eq(leaveRequest.employeeId, employee.id))
			.innerJoin(leaveType, eq(leaveRequest.leaveTypeId, leaveType.id))
			.where(
				and(
					eq(leaveRequest.organizationId, context.orgId),
					eq(leaveRequest.status, "pending"),
					subordinateIds
						? inArray(leaveRequest.employeeId, subordinateIds)
						: undefined,
				),
			)
			.orderBy(desc(leaveRequest.createdAt));
		return {
			requests: rows,
			scope: isAdmin ? ("admin" as const) : ("supervisor" as const),
		};
	},
);

export const decideLeave = createServerFn({ method: "POST" })
	.validator(
		(input: {
			requestId: string;
			decision: "approved" | "rejected";
			reason?: string;
		}) => input,
	)
	.handler(async ({ data }) => {
		const context = await requireMember();
		const isAdmin = ["owner", "admin"].includes(context.role ?? "");
		const isSupervisor = context.role === "supervisor";
		if (!isAdmin && !isSupervisor) {
			return { ok: false as const, reason: "Forbidden" };
		}
		const [request] = await getDb()
			.select({
				id: leaveRequest.id,
				employeeId: leaveRequest.employeeId,
				status: leaveRequest.status,
				startDate: leaveRequest.startDate,
				endDate: leaveRequest.endDate,
			})
			.from(leaveRequest)
			.where(
				and(
					eq(leaveRequest.id, data.requestId),
					eq(leaveRequest.organizationId, context.orgId),
				),
			)
			.limit(1);
		if (!request) {
			return { ok: false as const, reason: "Request not found" };
		}
		if (request.status !== "pending") {
			return { ok: false as const, reason: "Request has already been decided" };
		}
		if (context.employee?.id === request.employeeId) {
			return {
				ok: false as const,
				reason: "You cannot decide your own request",
			};
		}
		if (!isAdmin) {
			const [target] = await getDb()
				.select({ supervisorId: employee.supervisorId })
				.from(employee)
				.where(eq(employee.id, request.employeeId))
				.limit(1);
			const supervisorUserId = await resolveSupervisorUserId(
				context.orgId,
				target?.supervisorId ?? null,
			);
			if (supervisorUserId !== context.session.user.id) {
				return {
					ok: false as const,
					reason: "This request belongs to another supervisor's team",
				};
			}
		}
		if (data.decision === "approved") {
			const today = todayKey(context.org.timezone);
			if (request.startDate < today) {
				return {
					ok: false as const,
					reason: "Past-dated requests cannot be approved",
				};
			}
		}
		await getDb()
			.update(leaveRequest)
			.set({
				status: data.decision,
				decidedBy: context.session.user.id,
				decidedAt: new Date(),
				decisionReason: data.reason?.trim() || null,
				updatedAt: new Date(),
			})
			.where(eq(leaveRequest.id, data.requestId));
		await notifyEmployee(
			context.orgId,
			request.employeeId,
			`Your leave request was ${data.decision}`,
			`
				<p>Your leave request for <strong>${request.startDate}</strong>${request.endDate !== request.startDate ? ` → <strong>${request.endDate}</strong>` : ""} was <strong>${data.decision}</strong>.</p>
				${data.reason?.trim() ? `<p style="color:#555;">Note from your approver: ${data.reason.trim()}</p>` : ""}
			`,
			"/leave",
			`Leave ${request.startDate}${request.endDate !== request.startDate ? ` → ${request.endDate}` : ""} was ${data.decision}${data.reason?.trim() ? ` — note: ${data.reason.trim()}` : ""}`,
		);
		const [targetEmployee] = await getDb()
			.select({ userId: employee.userId })
			.from(employee)
			.where(eq(employee.id, request.employeeId))
			.limit(1);
		await logAudit({
			organizationId: context.orgId,
			userId: context.session.user.id,
			targetUserId: targetEmployee?.userId ?? null,
			action: "leave.decided",
			detail: `${data.decision} — ${request.startDate}${request.endDate !== request.startDate ? ` → ${request.endDate}` : ""}${data.reason?.trim() ? ` (${data.reason.trim()})` : ""}`,
		});
		return { ok: true as const };
	});

export const getOrgLeaveWidgets = createServerFn({ method: "GET" }).handler(
	async () => {
		const context = await requireMember();
		const today = todayKey(context.org.timezone);
		const upcomingHolidays = await getDb()
			.select({ date: orgHoliday.date, name: orgHoliday.name })
			.from(orgHoliday)
			.where(
				and(
					eq(orgHoliday.organizationId, context.orgId),
					gte(orgHoliday.date, today),
				),
			)
			.orderBy(asc(orgHoliday.date))
			.limit(3);
		// Monday-based week containing today
		const [year, month, day] = today.split("-").map(Number);
		const weekday = (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
		const weekStart = new Date(Date.UTC(year, month - 1, day - weekday))
			.toISOString()
			.slice(0, 10);
		const weekEnd = new Date(Date.UTC(year, month - 1, day - weekday + 6))
			.toISOString()
			.slice(0, 10);
		const onLeaveThisWeek = await getDb()
			.select({
				employeeName: employee.name,
				leaveTypeName: leaveType.name,
				startDate: leaveRequest.startDate,
				endDate: leaveRequest.endDate,
			})
			.from(leaveRequest)
			.innerJoin(employee, eq(employee.id, leaveRequest.employeeId))
			.innerJoin(leaveType, eq(leaveType.id, leaveRequest.leaveTypeId))
			.where(
				and(
					eq(leaveRequest.organizationId, context.orgId),
					eq(leaveRequest.status, "approved"),
					lte(leaveRequest.startDate, weekEnd),
					gte(leaveRequest.endDate, weekStart),
				),
			)
			.orderBy(asc(leaveRequest.startDate));
		return { today, weekStart, weekEnd, upcomingHolidays, onLeaveThisWeek };
	},
);
