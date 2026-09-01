import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "#/db";
import { employee, leaveRequest, leaveType, organization } from "#/db/schema";
import { countWorkingDays, isValidDateKey, rangesOverlap } from "./leave";
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
		total += countWorkingDays(start, end, workDays);
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
	const [org] = await getDb()
		.select({ workDays: organization.workDays })
		.from(organization)
		.where(eq(organization.id, (await getMemberContext())!.orgId))
		.limit(1);
	const workDays = org.workDays.split(",").map(Number);
	const days = countWorkingDays(startDate, endDate, workDays);
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
			);
			if (portion <= 0) {
				continue;
			}
			const used = await usedDaysForYear(
				employeeId,
				leaveTypeId,
				yearKey,
				workDays,
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
		const workDays = context.org.workDays.split(",").map(Number);
		const balances = [];
		for (const type of types) {
			const used = context.employee
				? await usedDaysForYear(context.employee.id, type.id, year, workDays)
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
		return { ok: true as const };
	});
