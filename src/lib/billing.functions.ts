import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "#/db";
import { creditLedger, member, organization } from "#/db/schema";
import { getCurrentSession } from "./session";
import {
	addMonths,
	GRACE_MS,
	type LedgerType,
	PAID_PLANS,
	PLANS,
	type PlanId,
	SUBSCRIPTION_MONTHS,
	type SubscriptionStatus,
	WARN_MS,
} from "./subscription";

export type SubscriptionState = {
	plan: PlanId;
	pendingPlan: PlanId | null;
	balanceSen: number;
	paidUntil: Date | null;
	status: SubscriptionStatus;
};

type OrganizationRow = typeof organization.$inferSelect;

async function writeLedger(options: {
	organizationId: string;
	type: LedgerType;
	amountSen: number;
	balanceAfterSen: number;
	note: string | null;
	createdBy: string | null;
}) {
	await getDb().insert(creditLedger).values({
		id: crypto.randomUUID(),
		organizationId: options.organizationId,
		type: options.type,
		amountSen: options.amountSen,
		balanceAfterSen: options.balanceAfterSen,
		note: options.note,
		createdBy: options.createdBy,
		createdAt: new Date(),
	});
}

async function getOrgById(orgId: string): Promise<OrganizationRow | undefined> {
	const [org] = await getDb()
		.select()
		.from(organization)
		.where(eq(organization.id, orgId))
		.limit(1);
	return org;
}

async function persistOrgState(org: OrganizationRow): Promise<void> {
	await getDb()
		.update(organization)
		.set({
			plan: org.plan,
			pendingPlan: org.pendingPlan,
			balanceSen: org.balanceSen,
			paidUntil: org.paidUntil,
		})
		.where(eq(organization.id, org.id));
}

function statusFor(org: OrganizationRow, now: Date): SubscriptionStatus {
	if (org.plan === "free" || !org.paidUntil) {
		return "active";
	}
	const paidUntilMs = org.paidUntil.getTime();
	const nowMs = now.getTime();
	if (paidUntilMs <= nowMs) {
		return "grace";
	}
	if (
		org.balanceSen < PLANS[org.plan as PlanId].priceSen &&
		paidUntilMs - nowMs <= WARN_MS
	) {
		return "warning";
	}
	return "active";
}

async function settleSubscription(
	org: OrganizationRow,
	userId: string | null,
): Promise<void> {
	const db = getDb();
	const now = Date.now();

	while (
		org.plan !== "free" &&
		org.paidUntil !== null &&
		org.paidUntil.getTime() <= now
	) {
		const nextPlan = (org.pendingPlan ?? org.plan) as PlanId;
		const priceSen = PLANS[nextPlan].priceSen;
		if (org.balanceSen < priceSen) {
			break;
		}
		org.balanceSen -= priceSen;
		org.paidUntil = addMonths(org.paidUntil, 1);
		const changedPlan =
			org.pendingPlan !== null && org.pendingPlan !== org.plan;
		org.plan = nextPlan;
		org.pendingPlan = null;
		await db
			.update(organization)
			.set({
				plan: org.plan,
				pendingPlan: org.pendingPlan,
				balanceSen: org.balanceSen,
				paidUntil: org.paidUntil,
			})
			.where(eq(organization.id, org.id));
		await writeLedger({
			organizationId: org.id,
			type: "subscription_charge",
			amountSen: -priceSen,
			balanceAfterSen: org.balanceSen,
			note: changedPlan
				? `${PLANS[org.plan as PlanId].name} monthly renewal (plan changed)`
				: `${PLANS[org.plan as PlanId].name} monthly renewal`,
			createdBy: userId,
		});
	}

	if (
		org.plan !== "free" &&
		org.paidUntil !== null &&
		org.paidUntil.getTime() + GRACE_MS <= now
	) {
		org.plan = "free";
		org.pendingPlan = null;
		org.paidUntil = null;
		await db
			.update(organization)
			.set({ plan: org.plan, pendingPlan: null, paidUntil: null })
			.where(eq(organization.id, org.id));
		await writeLedger({
			organizationId: org.id,
			type: "downgrade",
			amountSen: 0,
			balanceAfterSen: org.balanceSen,
			note: "Subscription expired after grace period — downgraded to Free",
			createdBy: userId,
		});
	}
}

export const ensureSubscription = createServerFn({ method: "GET" }).handler(
	async (): Promise<SubscriptionState | null> => {
		const session = await getCurrentSession();
		const orgId = session?.session.activeOrganizationId;
		if (!session || !orgId) {
			return null;
		}
		const org = await getOrgById(orgId);
		if (!org) {
			return null;
		}
		if (org.plan !== "free") {
			await settleSubscription(org, session.user.id);
		}
		return {
			plan: org.plan as PlanId,
			pendingPlan: (org.pendingPlan as PlanId | null) ?? null,
			balanceSen: org.balanceSen,
			paidUntil: org.paidUntil,
			status: statusFor(org, new Date()),
		};
	},
);

async function requireOrgBillingAccess() {
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
	const db = getDb();
	const [memberRow] = await db
		.select({ role: member.role })
		.from(member)
		.where(
			and(eq(member.organizationId, orgId), eq(member.userId, session.user.id)),
		)
		.limit(1);
	const orgRole = memberRow?.role ?? null;
	if (orgRole !== "owner" && orgRole !== "admin") {
		throw new Error("Forbidden");
	}
	return { session, orgId };
}

export const getBillingOverview = createServerFn({ method: "GET" }).handler(
	async () => {
		const { orgId } = await requireOrgBillingAccess();
		const org = await getOrgById(orgId);
		if (!org) {
			throw new Error("Organization not found");
		}
		const ledger = await getDb()
			.select()
			.from(creditLedger)
			.where(eq(creditLedger.organizationId, orgId))
			.orderBy(desc(creditLedger.createdAt))
			.limit(50);
		return {
			name: org.name,
			state: {
				plan: org.plan as PlanId,
				pendingPlan: (org.pendingPlan as PlanId | null) ?? null,
				balanceSen: org.balanceSen,
				paidUntil: org.paidUntil,
				status: statusFor(org, new Date()),
			} satisfies SubscriptionState,
			ledger,
		};
	},
);

export const subscribePlan = createServerFn({ method: "POST" })
	.validator(
		(input: { planId: PlanId; months: number }) =>
			input as {
				planId: PlanId;
				months: number;
			},
	)
	.handler(async ({ data }) => {
		const { planId, months } = data;
		if (!PAID_PLANS.includes(planId)) {
			return { ok: false as const, reason: "Invalid plan" };
		}
		if (
			!SUBSCRIPTION_MONTHS.includes(
				months as (typeof SUBSCRIPTION_MONTHS)[number],
			)
		) {
			return { ok: false as const, reason: "Invalid duration" };
		}
		const { orgId, session } = await requireOrgBillingAccess();
		const org = await getOrgById(orgId);
		if (!org) {
			return { ok: false as const, reason: "Organization not found" };
		}

		const now = new Date();
		const isActive =
			org.plan !== "free" &&
			org.paidUntil !== null &&
			org.paidUntil.getTime() > now.getTime();
		const planChanged = planId !== org.plan;

		if (isActive && planChanged) {
			await getDb()
				.update(organization)
				.set({ pendingPlan: planId })
				.where(eq(organization.id, orgId));
			return {
				ok: true as const,
				scheduled: true,
				state: {
					plan: org.plan as PlanId,
					pendingPlan: planId,
					balanceSen: org.balanceSen,
					paidUntil: org.paidUntil,
					status: statusFor({ ...org, pendingPlan: planId }, now),
				} satisfies SubscriptionState,
			};
		}

		const priceSen = PLANS[planId].priceSen * months;
		if (org.balanceSen < priceSen) {
			return {
				ok: false as const,
				reason: `Insufficient balance — ${PLANS[planId].name} for ${months} month${months > 1 ? "s" : ""} costs RM${(priceSen / 100).toFixed(2)}. Please top up first.`,
			};
		}

		org.balanceSen -= priceSen;
		const base =
			org.paidUntil !== null && org.paidUntil.getTime() > now.getTime()
				? org.paidUntil
				: now;
		org.paidUntil = addMonths(base, months);
		const changedPlan = org.plan !== planId;
		org.plan = planId;
		org.pendingPlan = null;
		await persistOrgState(org);
		await writeLedger({
			organizationId: orgId,
			type: "subscription_charge",
			amountSen: -priceSen,
			balanceAfterSen: org.balanceSen,
			note: changedPlan
				? `${PLANS[planId].name} x ${months} month${months > 1 ? "s" : ""} (plan changed)`
				: `${PLANS[planId].name} x ${months} month${months > 1 ? "s" : ""}`,
			createdBy: session.user.id,
		});
		return {
			ok: true as const,
			scheduled: false,
			state: {
				plan: org.plan as PlanId,
				pendingPlan: null,
				balanceSen: org.balanceSen,
				paidUntil: org.paidUntil,
				status: statusFor(org, now),
			} satisfies SubscriptionState,
		};
	});

export const listOrgBilling = createServerFn({ method: "GET" }).handler(
	async () => {
		const session = await getCurrentSession();
		if (!session?.user.role?.split(",").includes("admin")) {
			throw new Error("Forbidden");
		}
		const rows = await getDb()
			.select({
				id: organization.id,
				name: organization.name,
				plan: organization.plan,
				pendingPlan: organization.pendingPlan,
				balanceSen: organization.balanceSen,
				paidUntil: organization.paidUntil,
				createdAt: organization.createdAt,
				memberCount: sql<number>`(select count(*) from ${member} where ${member.organizationId} = ${organization.id})`,
			})
			.from(organization)
			.orderBy(desc(organization.createdAt));
		return rows.map(({ memberCount, ...row }) => ({
			...row,
			memberCount: Number(memberCount),
			plan: row.plan as PlanId,
			pendingPlan: (row.pendingPlan as PlanId | null) ?? null,
			status: statusFor(row as OrganizationRow, new Date()),
		}));
	},
);

export const adminAdjustCredit = createServerFn({ method: "POST" })
	.validator(
		(input: {
			organizationId: string;
			amountSen: number;
			type: "topup" | "adjustment";
			note: string;
		}) =>
			input as {
				organizationId: string;
				amountSen: number;
				type: "topup" | "adjustment";
				note: string;
			},
	)
	.handler(async ({ data }) => {
		const session = await getCurrentSession();
		if (!session?.user.role?.split(",").includes("admin")) {
			throw new Error("Forbidden");
		}
		const { organizationId, amountSen, type, note } = data;
		if (!Number.isInteger(amountSen) || amountSen === 0) {
			return { ok: false as const, reason: "Amount must be non-zero" };
		}
		if (type === "topup" && amountSen <= 0) {
			return { ok: false as const, reason: "Top up amount must be positive" };
		}
		const org = await getOrgById(organizationId);
		if (!org) {
			return { ok: false as const, reason: "Organization not found" };
		}
		org.balanceSen += amountSen;
		await getDb()
			.update(organization)
			.set({ balanceSen: org.balanceSen })
			.where(eq(organization.id, organizationId));
		await writeLedger({
			organizationId,
			type,
			amountSen,
			balanceAfterSen: org.balanceSen,
			note: note || null,
			createdBy: session.user.id,
		});
		return { ok: true as const, balanceSen: org.balanceSen };
	});
