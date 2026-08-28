import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, gt, lt, ne, sql } from "drizzle-orm";
import { getDb } from "#/db";
import { creditLedger, organization, user } from "#/db/schema";
import { getCurrentSession } from "./session";

async function requirePlatformAdmin() {
	const session = await getCurrentSession();
	if (!session?.user.role?.split(",").includes("admin")) {
		throw new Error("Forbidden");
	}
	return session;
}

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
