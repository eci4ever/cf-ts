import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { getDb } from "#/db";
import { employee, member, organization, user, workSite } from "#/db/schema";
import { logAudit } from "./audit.functions";
import { parseTimeToMinutes } from "./schedule";
import { getCurrentSession } from "./session";
import { PLANS, type PlanId } from "./subscription";

async function requireOrgAdmin() {
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

async function validateSiteId(
	orgId: string,
	siteId: string | null | undefined,
): Promise<{ ok: false; reason: string } | { ok: true }> {
	if (siteId === undefined) {
		return { ok: true };
	}
	if (siteId === null) {
		return { ok: true };
	}
	const [site] = await getDb()
		.select({ id: workSite.id })
		.from(workSite)
		.where(and(eq(workSite.id, siteId), eq(workSite.organizationId, orgId)))
		.limit(1);
	if (!site) {
		return { ok: false, reason: "Work site not found" };
	}
	return { ok: true };
}

async function getSeatCap(orgId: string): Promise<number | null> {
	const [org] = await getDb()
		.select({ plan: organization.plan })
		.from(organization)
		.where(eq(organization.id, orgId))
		.limit(1);
	if (!org) {
		throw new Error("Organization not found");
	}
	return PLANS[org.plan as PlanId].maxEmployees;
}

export const listEmployees = createServerFn({ method: "GET" }).handler(
	async () => {
		const { orgId } = await requireOrgAdmin();
		const supervisor = alias(employee, "supervisor");
		return getDb()
			.select({
				id: employee.id,
				name: employee.name,
				employeeNo: employee.employeeNo,
				position: employee.position,
				shift: employee.shift,
				joinedAt: employee.joinedAt,
				isActive: employee.isActive,
				supervisorId: employee.supervisorId,
				supervisorName: supervisor.name,
				siteId: employee.siteId,
				siteName: workSite.name,
				workDays: employee.workDays,
				workStartMinutes: employee.workStartMinutes,
				workEndMinutes: employee.workEndMinutes,
				graceMinutes: employee.graceMinutes,
				linkedEmail: user.email,
				linkedName: user.name,
			})
			.from(employee)
			.leftJoin(user, eq(employee.userId, user.id))
			.leftJoin(supervisor, eq(employee.supervisorId, supervisor.id))
			.leftJoin(workSite, eq(employee.siteId, workSite.id))
			.where(eq(employee.organizationId, orgId))
			.orderBy(asc(employee.employeeNo));
	},
);

export const suggestEmployeeNo = createServerFn({ method: "GET" }).handler(
	async () => {
		const { orgId } = await requireOrgAdmin();
		const rows = await getDb()
			.select({ employeeNo: employee.employeeNo })
			.from(employee)
			.where(eq(employee.organizationId, orgId));
		let max = 0;
		let width = 3;
		for (const row of rows) {
			const match = /^EMP-(\d+)$/.exec(row.employeeNo);
			if (match) {
				max = Math.max(max, Number(match[1]));
				width = Math.max(width, match[1].length);
			}
		}
		return { suggestion: `EMP-${String(max + 1).padStart(width, "0")}` };
	},
);

export const createEmployee = createServerFn({ method: "POST" })
	.validator(
		(input: {
			name: string;
			employeeNo: string;
			position?: string;
			shift: string;
			joinedAt?: string;
			siteId?: string | null;
		}) => input,
	)
	.handler(async ({ data }) => {
		const { orgId } = await requireOrgAdmin();
		const db = getDb();
		const siteCheck = await validateSiteId(orgId, data.siteId ?? null);
		if (!siteCheck.ok) {
			return { ok: false as const, reason: siteCheck.reason };
		}
		const cap = await getSeatCap(orgId);
		const [{ count }] = await db
			.select({ count: sql<number>`count(*)` })
			.from(employee)
			.where(
				and(eq(employee.organizationId, orgId), eq(employee.isActive, true)),
			);
		if (cap !== null && Number(count) >= cap) {
			return {
				ok: false as const,
				reason: `Plan limit reached (${cap} active employees). Upgrade your plan in Billing to add more.`,
			};
		}
		const employeeNo = data.employeeNo.trim();
		const name = data.name.trim();
		if (!name || !employeeNo) {
			return {
				ok: false as const,
				reason: "Name and employee number are required",
			};
		}
		if (!["normal", "flexi"].includes(data.shift)) {
			return { ok: false as const, reason: "Invalid shift" };
		}
		const [existing] = await db
			.select({ id: employee.id })
			.from(employee)
			.where(
				and(
					eq(employee.organizationId, orgId),
					eq(employee.employeeNo, employeeNo),
				),
			)
			.limit(1);
		if (existing) {
			return {
				ok: false as const,
				reason: `Employee number ${employeeNo} already exists`,
			};
		}
		const result = await db
			.insert(employee)
			.values({
				id: crypto.randomUUID(),
				organizationId: orgId,
				name,
				employeeNo,
				position: data.position?.trim() || null,
				shift: data.shift,
				joinedAt: data.joinedAt ? new Date(data.joinedAt) : null,
				siteId: data.siteId ?? null,
				isActive: true,
				createdAt: new Date(),
			})
			.returning({ id: employee.id });
		return { ok: true as const, id: result[0]?.id ?? null };
	});

async function requireEmployee(orgId: string, employeeId: string) {
	const [row] = await getDb()
		.select({ id: employee.id, isActive: employee.isActive })
		.from(employee)
		.where(and(eq(employee.id, employeeId), eq(employee.organizationId, orgId)))
		.limit(1);
	if (!row) {
		return null;
	}
	return row;
}

export const updateEmployee = createServerFn({ method: "POST" })
	.validator(
		(input: {
			employeeId: string;
			name?: string;
			employeeNo?: string;
			position?: string;
			shift?: string;
			joinedAt?: string;
			supervisorId?: string | null;
			siteId?: string | null;
		}) => input,
	)
	.handler(async ({ data }) => {
		const { orgId } = await requireOrgAdmin();
		const record = await requireEmployee(orgId, data.employeeId);
		if (!record) {
			return { ok: false as const, reason: "Employee not found" };
		}
		const db = getDb();
		const siteCheck = await validateSiteId(orgId, data.siteId);
		if (!siteCheck.ok) {
			return { ok: false as const, reason: siteCheck.reason };
		}
		if (data.employeeNo !== undefined) {
			const employeeNo = data.employeeNo.trim();
			const [existing] = await db
				.select({ id: employee.id })
				.from(employee)
				.where(
					and(
						eq(employee.organizationId, orgId),
						eq(employee.employeeNo, employeeNo),
					),
				)
				.limit(1);
			if (existing && existing.id !== data.employeeId) {
				return {
					ok: false as const,
					reason: `Employee number ${employeeNo} already exists`,
				};
			}
		}
		if (data.shift !== undefined && !["normal", "flexi"].includes(data.shift)) {
			return { ok: false as const, reason: "Invalid shift" };
		}
		if (data.supervisorId !== undefined && data.supervisorId !== null) {
			if (data.supervisorId === data.employeeId) {
				return {
					ok: false as const,
					reason: "An employee cannot be their own supervisor",
				};
			}
			let cursor: string | null = data.supervisorId;
			for (let depth = 0; cursor && depth < 25; depth += 1) {
				if (cursor === data.employeeId) {
					return {
						ok: false as const,
						reason: "This would create a supervision loop",
					};
				}
				const [step] = await db
					.select({ supervisorId: employee.supervisorId })
					.from(employee)
					.where(
						and(eq(employee.id, cursor), eq(employee.organizationId, orgId)),
					)
					.limit(1);
				cursor = step?.supervisorId ?? null;
			}
			const [supervisorRow] = await db
				.select({ isActive: employee.isActive })
				.from(employee)
				.where(
					and(
						eq(employee.id, data.supervisorId),
						eq(employee.organizationId, orgId),
					),
				)
				.limit(1);
			if (!supervisorRow || !supervisorRow.isActive) {
				return {
					ok: false as const,
					reason: "Supervisor must be an active employee",
				};
			}
		}
		await db
			.update(employee)
			.set({
				...(data.name !== undefined ? { name: data.name.trim() } : {}),
				...(data.employeeNo !== undefined
					? { employeeNo: data.employeeNo.trim() }
					: {}),
				...(data.position !== undefined
					? { position: data.position.trim() || null }
					: {}),
				...(data.shift !== undefined ? { shift: data.shift } : {}),
				...(data.joinedAt !== undefined
					? { joinedAt: data.joinedAt ? new Date(data.joinedAt) : null }
					: {}),
				...(data.supervisorId !== undefined
					? { supervisorId: data.supervisorId }
					: {}),
				...(data.siteId !== undefined ? { siteId: data.siteId } : {}),
			})
			.where(eq(employee.id, data.employeeId));
		return { ok: true as const };
	});

export const setEmployeeSchedule = createServerFn({ method: "POST" })
	.validator(
		(input: {
			employeeId: string;
			// null = follow the org default for that field
			workDays: number[] | null;
			startTime: string | null;
			endTime: string | null;
			graceMinutes: number | null;
		}) => input,
	)
	.handler(async ({ data }) => {
		const { orgId, session } = await requireOrgAdmin();
		const record = await requireEmployee(orgId, data.employeeId);
		if (!record) {
			return { ok: false as const, reason: "Employee not found" };
		}
		let workDays: string | null = null;
		let workStartMinutes: number | null = null;
		let workEndMinutes: number | null = null;
		let graceMinutes: number | null = null;
		if (data.workDays !== null) {
			const days = [...new Set(data.workDays)].filter(
				(day) => Number.isInteger(day) && day >= 0 && day <= 6,
			);
			if (days.length === 0) {
				return { ok: false as const, reason: "Select at least one work day" };
			}
			workDays = days.sort((a, b) => a - b).join(",");
		}
		if (data.startTime !== null || data.endTime !== null) {
			// times are validated as a pair — a custom start without an end is ambiguous
			if (data.startTime === null || data.endTime === null) {
				return {
					ok: false as const,
					reason: "Set both start and end times",
				};
			}
			const start = parseTimeToMinutes(data.startTime);
			const end = parseTimeToMinutes(data.endTime);
			if (start === null || end === null) {
				return { ok: false as const, reason: "Invalid times (use HH:MM)" };
			}
			if (end <= start) {
				return {
					ok: false as const,
					reason: "End time must be after start time",
				};
			}
			workStartMinutes = start;
			workEndMinutes = end;
		}
		if (data.graceMinutes !== null) {
			const grace = Math.round(Number(data.graceMinutes));
			if (!Number.isInteger(grace) || grace < 0 || grace > 240) {
				return {
					ok: false as const,
					reason: "Grace must be between 0 and 240 minutes",
				};
			}
			graceMinutes = grace;
		}
		await getDb()
			.update(employee)
			.set({ workDays, workStartMinutes, workEndMinutes, graceMinutes })
			.where(eq(employee.id, data.employeeId));
		const overrides = [
			workDays !== null ? `days ${workDays}` : null,
			workStartMinutes !== null
				? `${data.startTime}-${data.endTime}`
				: null,
			graceMinutes !== null ? `grace ${graceMinutes}m` : null,
		].filter(Boolean);
		await logAudit({
			organizationId: orgId,
			userId: session.user.id,
			targetUserId: undefined,
			action: "employees.schedule_set",
			detail: overrides.length > 0 ? overrides.join(" · ") : "Reset to org default",
		});
		return { ok: true as const };
	});

export const setEmployeeActive = createServerFn({ method: "POST" })
	.validator((input: { employeeId: string; isActive: boolean }) => input)
	.handler(async ({ data }) => {
		const { orgId } = await requireOrgAdmin();
		const record = await requireEmployee(orgId, data.employeeId);
		if (!record) {
			return { ok: false as const, reason: "Employee not found" };
		}
		if (data.isActive && !record.isActive) {
			const cap = await getSeatCap(orgId);
			const [{ count }] = await getDb()
				.select({ count: sql<number>`count(*)` })
				.from(employee)
				.where(
					and(eq(employee.organizationId, orgId), eq(employee.isActive, true)),
				);
			if (cap !== null && Number(count) >= cap) {
				return {
					ok: false as const,
					reason: `Plan limit reached (${cap} active employees). Upgrade your plan in Billing first.`,
				};
			}
		}
		await getDb()
			.update(employee)
			.set({ isActive: data.isActive })
			.where(eq(employee.id, data.employeeId));
		return { ok: true as const };
	});

export const linkEmployee = createServerFn({ method: "POST" })
	.validator((input: { employeeId: string; targetUserId?: string }) => input)
	.handler(async ({ data }) => {
		const { orgId } = await requireOrgAdmin();
		const record = await requireEmployee(orgId, data.employeeId);
		if (!record) {
			return { ok: false as const, reason: "Employee not found" };
		}
		const db = getDb();
		if (!data.targetUserId) {
			await db
				.update(employee)
				.set({ userId: null })
				.where(eq(employee.id, data.employeeId));
			return { ok: true as const };
		}
		const [memberRow] = await db
			.select({ userId: member.userId })
			.from(member)
			.where(
				and(
					eq(member.organizationId, orgId),
					eq(member.userId, data.targetUserId),
				),
			)
			.limit(1);
		if (!memberRow) {
			return {
				ok: false as const,
				reason: "Target is not a member of this organization",
			};
		}
		const [linked] = await db
			.select({ id: employee.id })
			.from(employee)
			.where(
				and(
					eq(employee.organizationId, orgId),
					eq(employee.userId, data.targetUserId),
				),
			)
			.limit(1);
		if (linked && linked.id !== data.employeeId) {
			return {
				ok: false as const,
				reason: "That member is already linked to another employee",
			};
		}
		await db
			.update(employee)
			.set({ userId: data.targetUserId })
			.where(eq(employee.id, data.employeeId));
		return { ok: true as const };
	});

export const listLinkableMembers = createServerFn({ method: "GET" }).handler(
	async () => {
		const { orgId } = await requireOrgAdmin();
		const employees = await getDb()
			.select({ userId: employee.userId })
			.from(employee)
			.where(eq(employee.organizationId, orgId));
		const linkedIds = new Set(
			employees
				.map((row) => row.userId)
				.filter((id): id is string => id !== null),
		);
		const members = await getDb()
			.select({ userId: member.userId, name: user.name, email: user.email })
			.from(member)
			.innerJoin(user, eq(member.userId, user.id))
			.where(eq(member.organizationId, orgId))
			.orderBy(asc(user.name));
		return members.filter((member) => !linkedIds.has(member.userId));
	},
);
