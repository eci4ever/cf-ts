import { env } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { getCurrentSession } from "./session";
import { listUserAuditLogs } from "./audit.functions";
import { alias } from "drizzle-orm/sqlite-core";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "#/db";
import { auditLog, notification, organization, user } from "#/db/schema";
import { getAuth } from "./auth";

export const getSession = createServerFn({ method: "GET" }).handler(
	async () => {
		const headers = getRequestHeaders();
		const session = await getAuth().api.getSession({ headers });

		return session;
	},
);

export const ensureSession = createServerFn({ method: "GET" }).handler(
	async () => {
		const headers = getRequestHeaders();
		const session = await getAuth().api.getSession({ headers });

		if (!session) {
			throw new Error("Unauthorized");
		}

		return session;
	},
);

export const ensureActiveOrg = createServerFn({ method: "GET" }).handler(
	async () => {
		const headers = getRequestHeaders();
		const auth = getAuth();
		const session = await auth.api.getSession({ headers });
		if (!session) {
			return { hasOrg: false };
		}
		if (session.session.activeOrganizationId) {
			return { hasOrg: true };
		}
		const organizations = await auth.api.listOrganizations({ headers });
		if (!organizations || organizations.length === 0) {
			return { hasOrg: false };
		}
		await auth.api.setActiveOrganization({
			body: { organizationId: organizations[0].id },
			headers,
		});
		return { hasOrg: true };
	},
);

export const getAuthMethods = createServerFn({ method: "GET" }).handler(
	async () => {
		return {
			google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
			debugEnvKeys: Object.keys(env).filter((key) =>
				key.includes("GOOGLE"),
			),
		};
	},
);


export const listMyActivity = createServerFn({ method: "GET" }).handler(
	async () => {
		const session = await getCurrentSession();
		if (!session) {
			return [];
		}
		return listUserAuditLogs(session.user.id, 50);
	},
);

export const listMyNotifications = createServerFn({ method: "GET" }).handler(
	async () => {
		const session = await getCurrentSession();
		if (!session) {
			return { items: [], unread: 0 };
		}
		const db = getDb();
		const items = await db
			.select({
				id: notification.id,
				title: notification.title,
				body: notification.body,
				linkPath: notification.linkPath,
				readAt: notification.readAt,
				createdAt: notification.createdAt,
			})
			.from(notification)
			.where(eq(notification.userId, session.user.id))
			.orderBy(desc(notification.createdAt))
			.limit(50);
		const [counts] = await db
			.select({ unread: sql<number>`count(*)`.mapWith(Number) })
			.from(notification)
			.where(
				and(
					eq(notification.userId, session.user.id),
					isNull(notification.readAt),
				),
			);
		return { items, unread: counts?.unread ?? 0 };
	},
);

export const markNotificationRead = createServerFn({ method: "POST" })
	.validator((input: { id: string }) => input)
	.handler(async ({ data }) => {
		const session = await getCurrentSession();
		if (!session) {
			return { ok: false as const };
		}
		await getDb()
			.update(notification)
			.set({ readAt: new Date() })
			.where(
				and(
					eq(notification.id, data.id),
					eq(notification.userId, session.user.id),
					isNull(notification.readAt),
				),
			);
		return { ok: true as const };
	});

export const markAllNotificationsRead = createServerFn({ method: "POST" }).handler(
	async () => {
		const session = await getCurrentSession();
		if (!session) {
			return { ok: false as const };
		}
		await getDb()
			.update(notification)
			.set({ readAt: new Date() })
			.where(
				and(
					eq(notification.userId, session.user.id),
					isNull(notification.readAt),
				),
			);
		return { ok: true as const };
	},
);


export const PLATFORM_AUDIT_ACTION_KEYS = [
	"account.sign_in",
	"account.sign_out",
	"account.password_changed",
	"account.email_changed",
	"account.2fa_enabled",
	"account.2fa_disabled",
	"impersonation.started",
	"leave.applied",
	"leave.decided",
	"issue.justification_submitted",
	"issue.reviewed",
	"settings.schedule_updated",
	"settings.holiday_added",
	"settings.holiday_removed",
	"settings.member_role_changed",
	"billing.subscribed",
	"billing.topup_approved",
	"billing.topup_rejected",
	"billing.downgraded",
];

export const listPlatformAuditLogs = createServerFn({ method: "GET" })
	.validator((input: { organizationId?: string | null; action?: string | null }) => input)
	.handler(async ({ data }) => {
		const session = await getCurrentSession();
		if (!session?.user.role?.split(",").includes("admin")) {
			throw new Error("Forbidden");
		}
		const actor = alias(user, "actor");
		const target = alias(user, "target");
		const conditions = [];
		if (data.organizationId) {
			conditions.push(eq(auditLog.organizationId, data.organizationId));
		}
		if (data.action) {
			conditions.push(eq(auditLog.action, data.action));
		}
		return getDb()
			.select({
				id: auditLog.id,
				createdAt: auditLog.createdAt,
				action: auditLog.action,
				detail: auditLog.detail,
				orgName: organization.name,
				actorName: actor.name,
				actorEmail: actor.email,
				targetName: target.name,
			})
			.from(auditLog)
			.leftJoin(organization, eq(auditLog.organizationId, organization.id))
			.leftJoin(actor, eq(auditLog.userId, actor.id))
			.leftJoin(target, eq(auditLog.targetUserId, target.id))
			.where(conditions.length > 0 ? and(...conditions) : undefined)
			.orderBy(desc(auditLog.createdAt))
			.limit(100);
	});
