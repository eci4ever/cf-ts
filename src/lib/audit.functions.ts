import { createServerFn } from "@tanstack/react-start";
import { desc, eq, or } from "drizzle-orm";
import { getDb } from "#/db";
import { auditLog } from "#/db/schema";
import { getCurrentSession } from "./session";

export type AuditInput = {
	organizationId?: string | null;
	userId: string;
	targetUserId?: string | null;
	action: string;
	detail?: string | null;
};

/** Append an audit trail entry. Fails silently — logging must never break operations. */
export async function logAudit(input: AuditInput): Promise<void> {
	try {
		await getDb().insert(auditLog).values({
			id: crypto.randomUUID(),
			organizationId: input.organizationId ?? null,
			userId: input.userId,
			targetUserId: input.targetUserId ?? null,
			action: input.action,
			detail: input.detail ?? null,
			createdAt: new Date(),
		});
	} catch (error) {
		console.error("[audit] failed to write entry", error);
	}
}

/** Latest audit entries where the user is the actor or the target. */
export async function listUserAuditLogs(
	userId: string,
	limit = 50,
): Promise<
	{ id: string; action: string; detail: string | null; createdAt: Date }[]
> {
	return getDb()
		.select({
			id: auditLog.id,
			action: auditLog.action,
			detail: auditLog.detail,
			createdAt: auditLog.createdAt,
		})
		.from(auditLog)
		.where(or(eq(auditLog.userId, userId), eq(auditLog.targetUserId, userId)))
		.orderBy(desc(auditLog.createdAt))
		.limit(limit);
}


export const listMyActivity = createServerFn({ method: "GET" }).handler(
	async () => {
		const session = await getCurrentSession();
		if (!session) {
			return [];
		}
		return listUserAuditLogs(session.user.id, 50);
	},
);

