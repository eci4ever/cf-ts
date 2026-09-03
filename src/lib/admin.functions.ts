import { createServerFn } from "@tanstack/react-start";
import { and, asc, desc, eq, gt, lt, ne, sql } from "drizzle-orm";
import { getDb } from "#/db";
import { creditLedger, employee, member, organization, user } from "#/db/schema";
import { statusFor } from "./subscription";
import { type SubscriptionStatus } from "./subscription";
import { getCurrentSession } from "./session";

async function requirePlatformAdmin() {
	const session = await getCurrentSession();
	if (!session?.user.role?.split(",").includes("admin")) {
		throw new Error("Forbidden");
	}
	return session;
}

export type OrgAdminDetail = {
	org: typeof organization.$inferSelect;
	status: SubscriptionStatus;
	members: {
		userId: string;
		name: string;
		email: string;
		role: string;
		joinedAt: Date;
	}[];
	employees: {
		id: string;
		employeeNo: string;
		name: string;
		position: string | null;
		isActive: boolean;
		supervisorName: string | null;
	}[];
};

export const getOrgAdminDetail = createServerFn({ method: "GET" })
	.validator((input: { orgId: string }) => input)
	.handler(async ({ data }): Promise<OrgAdminDetail | null> => {
		await requirePlatformAdmin();
		const db = getDb();
		const [org] = await db
			.select()
			.from(organization)
			.where(eq(organization.id, data.orgId))
			.limit(1);
		if (!org) {
			return null;
		}
		const members = await db
			.select({
				userId: member.userId,
				name: user.name,
				email: user.email,
				role: member.role,
				joinedAt: member.createdAt,
			})
			.from(member)
			.innerJoin(user, eq(member.userId, user.id))
			.where(eq(member.organizationId, org.id))
			.orderBy(asc(member.createdAt));
		const employees = await db
			.select({
				id: employee.id,
				employeeNo: employee.employeeNo,
				name: employee.name,
				position: employee.position,
				isActive: employee.isActive,
				supervisorId: employee.supervisorId,
			})
			.from(employee)
			.where(eq(employee.organizationId, org.id))
			.orderBy(asc(employee.name));
		const nameById = new Map(employees.map((row) => [row.id, row.name]));
		return {
			org,
			status: statusFor(org, new Date()),
			members,
			employees: employees.map(({ supervisorId, ...row }) => ({
				...row,
				supervisorName: supervisorId
					? (nameById.get(supervisorId) ?? null)
					: null,
			})),
		};
	});

export const getPlatformStats = createServerFn({ method: "GET" }).handler(
	async () => {
		await requirePlatformAdmin();
		const db = getDb();
		const now = new Date();
		const [[totalUsers], [totalOrgs], [activePaidOrgs], [graceOrgs]] =
			await Promise.all([
				db.select({ count: sql<number>`count(*)` }).from(user),
				db.select({ count: sql<number>`count(*)` }).from(organization),
				db
					.select({ count: sql<number>`count(*)` })
					.from(organization)
					.where(
						and(ne(organization.plan, "free"), gt(organization.paidUntil, now)),
					),
				db
					.select({ count: sql<number>`count(*)` })
					.from(organization)
					.where(
						and(ne(organization.plan, "free"), lt(organization.paidUntil, now)),
					),
			]);
		return {
			totalUsers: Number(totalUsers.count),
			totalOrgs: Number(totalOrgs.count),
			activePaidOrgs: Number(activePaidOrgs.count),
			graceOrgs: Number(graceOrgs.count),
		};
	},
);

export const listOrgLedger = createServerFn({ method: "GET" })
	.validator((input: { organizationId: string }) => input)
	.handler(async ({ data }) => {
		await requirePlatformAdmin();
		return getDb()
			.select({
				id: creditLedger.id,
				type: creditLedger.type,
				amountSen: creditLedger.amountSen,
				balanceAfterSen: creditLedger.balanceAfterSen,
				note: creditLedger.note,
				createdAt: creditLedger.createdAt,
				createdByName: user.name,
			})
			.from(creditLedger)
			.leftJoin(user, eq(creditLedger.createdBy, user.id))
			.where(eq(creditLedger.organizationId, data.organizationId))
			.orderBy(desc(creditLedger.createdAt))
			.limit(50);
	});
