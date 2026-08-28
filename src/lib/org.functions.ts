import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq, gt } from "drizzle-orm";
import { getDb } from "#/db";
import { invitation, member, organization, user } from "#/db/schema";
import { getCurrentSession } from "./session";

export const listOrgMembers = createServerFn({ method: "GET" }).handler(
	async () => {
		const session = await getCurrentSession();
		if (!session) {
			throw new Error("Unauthorized");
		}
		const activeOrganizationId = session.session.activeOrganizationId;
		if (!activeOrganizationId) {
			throw new Error("No active organization");
		}
		return getDb()
			.select({
				id: member.id,
				userId: user.id,
				name: user.name,
				email: user.email,
				role: member.role,
				joinedAt: member.createdAt,
			})
			.from(member)
			.innerJoin(user, eq(member.userId, user.id))
			.where(eq(member.organizationId, activeOrganizationId))
			.orderBy(asc(member.createdAt));
	},
);

export const getMyOrgRole = createServerFn({ method: "GET" }).handler(
	async () => {
		const session = await getCurrentSession();
		if (!session?.session.activeOrganizationId) {
			return null;
		}
		const rows = await getDb()
			.select({ role: member.role })
			.from(member)
			.where(
				and(
					eq(member.userId, session.user.id),
					eq(member.organizationId, session.session.activeOrganizationId),
				),
			)
			.limit(1);
		return rows[0]?.role ?? null;
	},
);

export const listOrgInvitations = createServerFn({ method: "GET" }).handler(
	async () => {
		const session = await getCurrentSession();
		if (!session) {
			throw new Error("Unauthorized");
		}
		const activeOrganizationId = session.session.activeOrganizationId;
		if (!activeOrganizationId) {
			throw new Error("No active organization");
		}
		return getDb()
			.select({
				id: invitation.id,
				email: invitation.email,
				role: invitation.role,
				status: invitation.status,
				expiresAt: invitation.expiresAt,
			})
			.from(invitation)
			.where(
				and(
					eq(invitation.organizationId, activeOrganizationId),
					eq(invitation.status, "pending"),
				),
			);
	},
);

export const listMyInvitations = createServerFn({ method: "GET" }).handler(
	async () => {
		const session = await getCurrentSession();
		if (!session) {
			return [];
		}
		return getDb()
			.select({
				id: invitation.id,
				organizationId: invitation.organizationId,
				organizationName: organization.name,
				role: invitation.role,
				expiresAt: invitation.expiresAt,
			})
			.from(invitation)
			.innerJoin(organization, eq(invitation.organizationId, organization.id))
			.where(
				and(
					eq(invitation.email, session.user.email),
					eq(invitation.status, "pending"),
					gt(invitation.expiresAt, new Date()),
				),
			);
	},
);
