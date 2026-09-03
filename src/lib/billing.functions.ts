import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, like, sql } from "drizzle-orm";
import { getDb } from "#/db";
import {
	creditLedger,
	member,
	organization,
	topupRequest,
	user,
} from "#/db/schema";
import { sendEmail } from "./email";
import { notifyOrgAdmins } from "./notify";
import { logAudit } from "./audit.functions";
import { getCurrentSession } from "./session";
import {
	addMonths,
	GRACE_MS,
	formatRm,
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

export function statusFor(org: OrganizationRow, now: Date): SubscriptionStatus {
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
		await notifyOrgAdmins(
			org.id,
			`Subscription renewed — ${PLANS[org.plan as PlanId].name}`,
			`
				<p><strong>${org.name}</strong> was renewed for one month on the ${PLANS[org.plan as PlanId].name} plan.</p>
				<p style="margin:8px 0;">Charged: <strong>${formatRm(priceSen)}</strong> · New balance: <strong>${formatRm(org.balanceSen)}</strong></p>
				<p style="color:#555;">Paid until ${org.paidUntil.toLocaleDateString("en-MY")}</p>
			`,
			"/billing",
			`Renewed on the ${PLANS[org.plan as PlanId].name} plan — charged ${formatRm(priceSen)}, new balance ${formatRm(org.balanceSen)}, paid until ${org.paidUntil.toLocaleDateString("en-MY")}`,
		);
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
		if (userId) {
			await logAudit({
				organizationId: org.id,
				userId,
				action: "billing.downgraded",
				detail: "Subscription downgraded to Free after grace period",
			});
		}
		await notifyOrgAdmins(
			org.id,
			"Action needed: subscription downgraded to Free",
			`
				<p style="color:#b91c1c;"><strong>${org.name}</strong>'s subscription expired and the organization was downgraded to the <strong>Free</strong> plan (max 5 active employees).</p>
				<p>Top up your credit and subscribe to a paid plan to restore full access.</p>
			`,
			`/billing`,
			`${org.name} was downgraded to the Free plan (max 5 active employees) — top up and subscribe to restore full access`,
		);
	}

	// low-balance warning — at most once per subscription cycle
	const status = statusFor(org, new Date());
	if (
		org.plan !== "free" &&
		org.paidUntil !== null &&
		status === "warning" &&
		(org.billingWarnedUntil === null ||
			org.billingWarnedUntil.getTime() !== org.paidUntil.getTime())
	) {
		await db
			.update(organization)
			.set({ billingWarnedUntil: org.paidUntil })
			.where(eq(organization.id, org.id));
		await notifyOrgAdmins(
			org.id,
			"Low balance — subscription renewal upcoming",
			`
				<p><strong>${org.name}</strong>'s paid period ends on <strong>${org.paidUntil.toLocaleDateString("en-MY")}</strong>.</p>
				<p>Current balance: <strong>${formatRm(org.balanceSen)}</strong> — not enough for the next ${PLANS[org.plan as PlanId].name} renewal (${formatRm(PLANS[org.plan as PlanId].priceSen)}). Top up to avoid a downgrade to Free.</p>
			`,
			"/billing",
			`Balance ${formatRm(org.balanceSen)} is not enough for the next ${PLANS[org.plan as PlanId].name} renewal (${formatRm(PLANS[org.plan as PlanId].priceSen)} due ${org.paidUntil.toLocaleDateString("en-MY")}) — top up to avoid downgrade`,
		);
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
		await logAudit({
			organizationId: orgId,
			userId: session.user.id,
			action: "billing.subscribed",
			detail: `${PLANS[planId].name} plan for ${months} month${months > 1 ? "s" : ""} — ${formatRm(priceSen)}`,
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
				memberCount: sql<number>`count(${member.id})`.mapWith(Number),
			})
			.from(organization)
			.leftJoin(member, eq(member.organizationId, organization.id))
			.groupBy(organization.id)
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

async function notifyPlatformAdmins(
	subject: string,
	bodyHtml: string,
): Promise<void> {
	const admins = await getDb()
		.select({ email: user.email })
		.from(user)
		.where(like(user.role, "%admin%"));
	for (const admin of admins) {
		await sendEmail({ to: admin.email, subject, html: `<div style="font-family:Arial,sans-serif;">${bodyHtml}</div>` });
	}
}

export const requestTopup = createServerFn({ method: "POST" })
	.validator((input: { amountSen: number; paymentRef: string }) => input)
	.handler(async ({ data }) => {
		const { orgId, session } = await requireOrgBillingAccess();
		const amountSen = Math.round(Number(data.amountSen));
		if (!Number.isFinite(amountSen) || amountSen < 1000) {
			return { ok: false as const, reason: "Minimum top-up is RM10" };
		}
		if (amountSen > 10_000_000) {
			return { ok: false as const, reason: "Maximum top-up is RM100,000" };
		}
		const paymentRef = data.paymentRef.trim();
		if (paymentRef.length < 3 || paymentRef.length > 60) {
			return {
				ok: false as const,
				reason: "Payment reference must be 3–60 characters",
			};
		}
		const db = getDb();
		const [existing] = await db
			.select({ id: topupRequest.id })
			.from(topupRequest)
			.where(
				and(
					eq(topupRequest.organizationId, orgId),
					eq(topupRequest.status, "pending"),
				),
			)
			.limit(1);
		if (existing) {
			return {
				ok: false as const,
				reason: "You already have a pending top-up request",
			};
		}
		const now = new Date();
		await db.insert(topupRequest).values({
			id: crypto.randomUUID(),
			organizationId: orgId,
			amountSen,
			paymentRef,
			status: "pending",
			requestedBy: session.user.id,
			createdAt: now,
			updatedAt: now,
		});
		const [org] = await db
			.select({ name: organization.name })
			.from(organization)
			.where(eq(organization.id, orgId))
			.limit(1);
		await notifyPlatformAdmins(
			`New top-up request — ${org?.name ?? orgId}`,
			`
				<p><strong>${org?.name ?? "An organization"}</strong> requested a credit top-up.</p>
				<p style="margin:8px 0;">Amount: <strong>${formatRm(amountSen)}</strong> · Payment ref: <strong>${paymentRef}</strong></p>
				<p>Review it in the platform admin area.</p>
			`,
		);
		return { ok: true as const };
	});

export const listMyTopupRequests = createServerFn({ method: "GET" }).handler(
	async () => {
		const { orgId } = await requireOrgBillingAccess();
		return getDb()
			.select({
				id: topupRequest.id,
				amountSen: topupRequest.amountSen,
				paymentRef: topupRequest.paymentRef,
				status: topupRequest.status,
				decisionNote: topupRequest.decisionNote,
				createdAt: topupRequest.createdAt,
			})
			.from(topupRequest)
			.where(eq(topupRequest.organizationId, orgId))
			.orderBy(desc(topupRequest.createdAt))
			.limit(10);
	},
);

export const listPendingTopupRequests = createServerFn({ method: "GET" }).handler(
	async () => {
		const session = await getCurrentSession();
		if (!session?.user.role?.split(",").includes("admin")) {
			throw new Error("Forbidden");
		}
		return getDb()
			.select({
				id: topupRequest.id,
				organizationId: topupRequest.organizationId,
				orgName: organization.name,
				amountSen: topupRequest.amountSen,
				paymentRef: topupRequest.paymentRef,
				requestedByName: user.name,
				createdAt: topupRequest.createdAt,
			})
			.from(topupRequest)
			.innerJoin(
				organization,
				eq(topupRequest.organizationId, organization.id),
			)
			.innerJoin(user, eq(topupRequest.requestedBy, user.id))
			.where(eq(topupRequest.status, "pending"))
			.orderBy(desc(topupRequest.createdAt));
	},
);

export const decideTopupRequest = createServerFn({ method: "POST" })
	.validator(
		(input: {
			requestId: string;
			decision: "approved" | "rejected";
			note?: string;
		}) => input,
	)
	.handler(async ({ data }) => {
		const session = await getCurrentSession();
		if (!session?.user.role?.split(",").includes("admin")) {
			throw new Error("Forbidden");
		}
		const db = getDb();
		const [request] = await db
			.select()
			.from(topupRequest)
			.where(eq(topupRequest.id, data.requestId))
			.limit(1);
		if (!request) {
			return { ok: false as const, reason: "Request not found" };
		}
		if (request.status !== "pending") {
			return { ok: false as const, reason: "Request already decided" };
		}
		const note = data.note?.trim() || null;
		await db
			.update(topupRequest)
			.set({
				status: data.decision,
				decidedBy: session.user.id,
				decidedAt: new Date(),
				decisionNote: note,
				updatedAt: new Date(),
			})
			.where(eq(topupRequest.id, data.requestId));

		if (data.decision === "approved") {
			const [org] = await db
				.select({ balanceSen: organization.balanceSen })
				.from(organization)
				.where(eq(organization.id, request.organizationId))
				.limit(1);
			const balanceSen = (org?.balanceSen ?? 0) + request.amountSen;
			await db
				.update(organization)
				.set({ balanceSen })
				.where(eq(organization.id, request.organizationId));
			await writeLedger({
				organizationId: request.organizationId,
				type: "topup",
				amountSen: request.amountSen,
				balanceAfterSen: balanceSen,
				note: `Top-up approved (ref: ${request.paymentRef})`,
				createdBy: session.user.id,
			});
		}
		await notifyOrgAdmins(
			request.organizationId,
			`Top-up request ${data.decision}`,
			`
				<p>Your top-up request of <strong>${formatRm(request.amountSen)}</strong> (ref: ${request.paymentRef}) was <strong>${data.decision}</strong>.</p>
				${note ? `<p style="color:#555;">Note: ${note}</p>` : ""}
				${data.decision === "approved" ? "<p>The credit has been added to your organization balance.</p>" : ""}
			`,
			"/billing",
			`Top-up of ${formatRm(request.amountSen)} (ref: ${request.paymentRef}) was ${data.decision}${data.decision === "approved" ? " — credit added to your balance" : ""}`,
		);
		await logAudit({
			organizationId: request.organizationId,
			userId: session.user.id,
			targetUserId: request.requestedBy,
			action: data.decision === "approved" ? "billing.topup_approved" : "billing.topup_rejected",
			detail: `${formatRm(request.amountSen)} (ref: ${request.paymentRef})${note ? ` — ${note}` : ""}`,
		});
		return { ok: true as const };
	});
