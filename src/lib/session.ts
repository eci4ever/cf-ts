import { getRequestHeaders } from "@tanstack/react-start/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "#/db";
import { employee, member, organization } from "#/db/schema";
import { getAuth } from "./auth";

export async function getCurrentSession() {
	const headers = getRequestHeaders();
	return getAuth().api.getSession({ headers });
}

export type OrgMemberContext = {
	session: NonNullable<Awaited<ReturnType<typeof getCurrentSession>>>;
	orgId: string;
	org: typeof organization.$inferSelect;
	role: string | null;
	employee: {
		id: string;
		name: string;
		supervisorId: string | null;
		isActive: boolean;
		workDays: string | null;
		workStartMinutes: number | null;
		workEndMinutes: number | null;
		graceMinutes: number | null;
	} | null;
};

export async function getOrgMemberContext(): Promise<OrgMemberContext | null> {
	const session = await getCurrentSession();
	if (!session) {
		return null;
	}
	const orgId = session.session.activeOrganizationId;
	if (!orgId) {
		return null;
	}
	const [org] = await getDb()
		.select()
		.from(organization)
		.where(eq(organization.id, orgId))
		.limit(1);
	if (!org) {
		return null;
	}
	const [memberRow] = await getDb()
		.select({ role: member.role })
		.from(member)
		.where(
			and(eq(member.organizationId, orgId), eq(member.userId, session.user.id)),
		)
		.limit(1);
	const [linked] = await getDb()
		.select({
			id: employee.id,
			name: employee.name,
			supervisorId: employee.supervisorId,
			isActive: employee.isActive,
			workDays: employee.workDays,
			workStartMinutes: employee.workStartMinutes,
			workEndMinutes: employee.workEndMinutes,
			graceMinutes: employee.graceMinutes,
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
		orgId,
		org,
		role: memberRow?.role ?? null,
		employee: linked && linked.isActive ? linked : null,
	};
}
