import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "#/db";
import {
	employee,
	member,
	orgHoliday,
	organization,
	session,
	user,
} from "#/db/schema";
import { parseTimeToMinutes } from "./schedule";
import { getCurrentSession } from "./session";

async function requireOrgRole(allowedRoles: string[]) {
	const session = await getCurrentSession();
	if (!session) {
		throw new Error("Unauthorized");
	}
	const orgId = session.session.activeOrganizationId;
	if (!orgId) {
		throw new Error("No active organization");
	}
	const [memberRow] = await getDb()
		.select({ role: member.role })
		.from(member)
		.where(
			and(eq(member.organizationId, orgId), eq(member.userId, session.user.id)),
		)
		.limit(1);
	if (!memberRow?.role || !allowedRoles.includes(memberRow.role)) {
		throw new Error("Forbidden");
	}
	return { session, orgId, role: memberRow.role };
}

export const getOrgSettings = createServerFn({ method: "GET" }).handler(
	async () => {
		const {
			orgId,
			role,
			session: currentSession,
		} = await requireOrgRole(["owner", "admin"]);
		const [org] = await getDb()
			.select({
				name: organization.name,
				slug: organization.slug,
				workDays: organization.workDays,
				workStartMinutes: organization.workStartMinutes,
				workEndMinutes: organization.workEndMinutes,
				graceMinutes: organization.graceMinutes,
			})
			.from(organization)
			.where(eq(organization.id, orgId))
			.limit(1);
		if (!org) {
			throw new Error("Organization not found");
		}
		const members = await getDb()
			.select({
				userId: member.userId,
				name: user.name,
				email: user.email,
				role: member.role,
				joinedAt: member.createdAt,
			})
			.from(member)
			.innerJoin(user, eq(member.userId, user.id))
			.where(eq(member.organizationId, orgId))
			.orderBy(asc(member.createdAt));
		const employees = await getDb()
			.select({
				id: employee.id,
				userId: employee.userId,
				supervisorId: employee.supervisorId,
				isActive: employee.isActive,
			})
			.from(employee)
			.where(eq(employee.organizationId, orgId));
		const employeeIdByUserId = new Map(
			employees
				.filter((row) => row.userId && row.isActive)
				.map((row) => [row.userId!, row.id]),
		);
		const userIdByEmployeeId = new Map(
			employees
				.filter((row) => row.userId && row.isActive)
				.map((row) => [row.id, row.userId!]),
		);
		const subordinateCountByUserId = new Map<string, number>();
		for (const row of employees) {
			if (!row.isActive || !row.supervisorId) continue;
			const supervisorUserId = userIdByEmployeeId.get(row.supervisorId);
			if (supervisorUserId) {
				subordinateCountByUserId.set(
					supervisorUserId,
					(subordinateCountByUserId.get(supervisorUserId) ?? 0) + 1,
				);
			}
		}
		const membersWithMeta = members.map((entry) => ({
			...entry,
			hasEmployeeRecord: employeeIdByUserId.has(entry.userId),
			subordinateCount: subordinateCountByUserId.get(entry.userId) ?? 0,
		}));
		const holidays = await getDb()
			.select({
				id: orgHoliday.id,
				name: orgHoliday.name,
				date: orgHoliday.date,
			})
			.from(orgHoliday)
			.where(eq(orgHoliday.organizationId, orgId))
			.orderBy(asc(orgHoliday.date));
		return {
			name: org.name,
			slug: org.slug,
			schedule: {
				workDays: org.workDays.split(",").map(Number),
				workStartMinutes: org.workStartMinutes,
				workEndMinutes: org.workEndMinutes,
				graceMinutes: org.graceMinutes,
				timezone: "Asia/Kuala_Lumpur",
			},
			role,
			currentUserId: currentSession.user.id,
			members: membersWithMeta,
			holidays,
		};
	},
);

export const setMemberRole = createServerFn({ method: "POST" })
	.validator((input: { userId: string; role: string }) => input)
	.handler(async ({ data }) => {
		const { orgId } = await requireOrgRole(["owner", "admin"]);
		const { role } = data;
		if (!["member", "supervisor", "admin"].includes(role)) {
			return { ok: false as const, reason: "Invalid role" };
		}
		const db = getDb();
		const [targetMember] = await db
			.select({ role: member.role })
			.from(member)
			.where(
				and(eq(member.organizationId, orgId), eq(member.userId, data.userId)),
			)
			.limit(1);
		if (!targetMember) {
			return { ok: false as const, reason: "Member not found" };
		}
	if (targetMember.role === "owner") {
		return {
			ok: false as const,
			reason: "Use ownership transfer to change the owner's role",
		};
	}
	if (role === "supervisor") {
		const [linked] = await db
			.select({ id: employee.id })
			.from(employee)
			.where(
				and(
					eq(employee.organizationId, orgId),
					eq(employee.userId, data.userId),
					eq(employee.isActive, true),
				),
			)
			.limit(1);
		if (!linked) {
			return {
				ok: false as const,
				reason:
					"This user has no active employee record — add one on the Employees page first",
			};
		}
	}
	await db
			.update(member)
			.set({ role })
			.where(
				and(eq(member.organizationId, orgId), eq(member.userId, data.userId)),
			);
		return { ok: true as const };
	});

export const updateSchedule = createServerFn({ method: "POST" })
	.validator(
		(input: {
			workDays: number[];
			startTime: string;
			endTime: string;
			graceMinutes: number;
		}) => input,
	)
	.handler(async ({ data }) => {
		const { orgId } = await requireOrgRole(["owner", "admin"]);
		const workStartMinutes = parseTimeToMinutes(data.startTime);
		const workEndMinutes = parseTimeToMinutes(data.endTime);
		if (workStartMinutes === null || workEndMinutes === null) {
			return { ok: false as const, reason: "Invalid work times (use HH:MM)" };
		}
		if (workEndMinutes <= workStartMinutes) {
			return {
				ok: false as const,
				reason: "End time must be after start time",
			};
		}
		const workDays = [...new Set(data.workDays)].filter(
			(day) => Number.isInteger(day) && day >= 0 && day <= 6,
		);
		if (workDays.length === 0) {
			return { ok: false as const, reason: "Select at least one work day" };
		}
		const graceMinutes = Math.round(Number(data.graceMinutes));
		if (
			!Number.isInteger(graceMinutes) ||
			graceMinutes < 0 ||
			graceMinutes > 240
		) {
			return {
				ok: false as const,
				reason: "Grace must be between 0 and 240 minutes",
			};
		}
		// timezone is locked to Asia/Kuala_Lumpur — this product serves
		// Malaysian SMEs, and changing tz would shift historical date boundaries
		await getDb()
			.update(organization)
			.set({
				workDays: workDays.sort().join(","),
				workStartMinutes,
				workEndMinutes,
				graceMinutes,
			})
			.where(eq(organization.id, orgId));
		return { ok: true as const };
	});

export const updateOrgName = createServerFn({ method: "POST" })
	.validator((input: { name: string }) => input)
	.handler(async ({ data }) => {
		const { orgId } = await requireOrgRole(["owner", "admin"]);
		const name = data.name.trim();
		if (name.length < 2 || name.length > 80) {
			return { ok: false as const, reason: "Name must be 2–80 characters" };
		}
		await getDb()
			.update(organization)
			.set({ name })
			.where(eq(organization.id, orgId));
		return { ok: true as const, name };
	});

export const transferOwnership = createServerFn({ method: "POST" })
	.validator((input: { targetUserId: string }) => input)
	.handler(async ({ data }) => {
		const { session, orgId } = await requireOrgRole(["owner"]);
		if (data.targetUserId === session.user.id) {
			return { ok: false as const, reason: "Choose another member" };
		}
		const db = getDb();
		const [target] = await db
			.select({ userId: member.userId })
			.from(member)
			.where(
				and(
					eq(member.organizationId, orgId),
					eq(member.userId, data.targetUserId),
				),
			)
			.limit(1);
		if (!target) {
			return { ok: false as const, reason: "Target member not found" };
		}
		await db
			.update(member)
			.set({ role: "admin" })
			.where(
				and(
					eq(member.organizationId, orgId),
					eq(member.userId, session.user.id),
					eq(member.role, "owner"),
				),
			);
		await db
			.update(member)
			.set({ role: "owner" })
			.where(
				and(
					eq(member.organizationId, orgId),
					eq(member.userId, data.targetUserId),
				),
			);
		return { ok: true as const };
	});

export const deleteCurrentOrg = createServerFn({ method: "POST" }).handler(
	async () => {
		const { orgId } = await requireOrgRole(["owner"]);
		const db = getDb();
		await db
			.update(session)
			.set({ activeOrganizationId: null })
			.where(eq(session.activeOrganizationId, orgId));
		await db.delete(organization).where(eq(organization.id, orgId));
		return { ok: true as const };
	},
);

export const addHoliday = createServerFn({ method: "POST" })
	.validator((input: { name: string; date: string }) => input)
	.handler(async ({ data }) => {
		const { orgId } = await requireOrgRole(["owner", "admin"]);
		const name = data.name.trim();
		const date = data.date.trim();
		if (name.length < 2 || name.length > 60) {
			return { ok: false as const, reason: "Name must be 2–60 characters" };
		}
		if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
			return { ok: false as const, reason: "Invalid date" };
		}
		const [existing] = await getDb()
			.select({ id: orgHoliday.id })
			.from(orgHoliday)
			.where(
				and(eq(orgHoliday.organizationId, orgId), eq(orgHoliday.date, date)),
			)
			.limit(1);
		if (existing) {
			return {
				ok: false as const,
				reason: "A holiday already exists on that date",
			};
		}
		await getDb().insert(orgHoliday).values({
			id: crypto.randomUUID(),
			organizationId: orgId,
			name,
			date,
			createdAt: new Date(),
		});
		return { ok: true as const };
	});

export const deleteHoliday = createServerFn({ method: "POST" })
	.validator((input: { holidayId: string }) => input)
	.handler(async ({ data }) => {
		const { orgId } = await requireOrgRole(["owner", "admin"]);
		await getDb()
			.delete(orgHoliday)
			.where(
				and(
					eq(orgHoliday.id, data.holidayId),
					eq(orgHoliday.organizationId, orgId),
				),
			);
		return { ok: true as const };
	});
