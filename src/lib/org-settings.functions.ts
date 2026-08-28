import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "#/db";
import { member, organization, session, user } from "#/db/schema";
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
			.select({ name: organization.name, slug: organization.slug })
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
		return {
			name: org.name,
			slug: org.slug,
			role,
			currentUserId: currentSession.user.id,
			members,
		};
	},
);

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
