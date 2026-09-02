import { env } from "cloudflare:workers";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "#/db";
import { employee, member, notification, organization, user } from "#/db/schema";
import { sendEmail } from "./email";

async function orgEmailNotificationsEnabled(orgId: string): Promise<boolean> {
	const [org] = await getDb()
		.select({ emailNotifications: organization.emailNotifications })
		.from(organization)
		.where(eq(organization.id, orgId))
		.limit(1);
	return org?.emailNotifications ?? false;
}

function wrapHtml(bodyHtml: string, linkPath?: string): string {
	const brand = env.EMAIL_BRAND_NAME || "TapMe";
	const base = env.BETTER_AUTH_URL || "";
	const link =
		linkPath && base
			? `<p style="margin-top:16px;"><a href="${base}${linkPath}">Open ${brand}</a></p>`
			: "";
	return `
		<div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
			<p style="font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #888; margin: 24px 0 8px;">${brand}</p>
			${bodyHtml}
			${link}
			<p style="font-size: 11px; color: #aaa; margin-top: 24px;">
				Sent by ${brand}. Your admin can turn these emails off in Settings.
			</p>
		</div>
	`;
}

/**
 * Record an in-app notification. Always written regardless of the org's email
 * toggle — that toggle governs email only. Fails silently.
 */
async function pushInApp(
	orgId: string,
	userId: string | null,
	title: string,
	summary: string | undefined,
	linkPath?: string,
): Promise<void> {
	if (!userId) return;
	try {
		await getDb().insert(notification).values({
			id: crypto.randomUUID(),
			organizationId: orgId,
			userId,
			title,
			body: summary ?? null,
			linkPath: linkPath ?? null,
			createdAt: new Date(),
		});
	} catch {
		// in-app delivery must never break the triggering operation
	}
}

/** Email a linked user. Fails silently — notifications must never break operations. */
async function notifyUser(
	orgId: string,
	userId: string | null,
	subject: string,
	bodyHtml: string,
	linkPath?: string,
	summary?: string,
): Promise<void> {
	await pushInApp(orgId, userId, subject, summary, linkPath);
	if (!userId) return;
	if (!(await orgEmailNotificationsEnabled(orgId))) return;
	const [target] = await getDb()
		.select({ email: user.email })
		.from(user)
		.where(eq(user.id, userId))
		.limit(1);
	if (!target?.email) return;
	await sendEmail({
		to: target.email,
		subject,
		html: wrapHtml(bodyHtml, linkPath),
	});
}

/** Notify the employee's linked account (skipped when the employee has no account). */
export async function notifyEmployee(
	orgId: string,
	employeeId: string,
	subject: string,
	bodyHtml: string,
	linkPath?: string,
	summary?: string,
): Promise<void> {
	const [row] = await getDb()
		.select({ userId: employee.userId })
		.from(employee)
		.where(and(eq(employee.id, employeeId), eq(employee.organizationId, orgId)))
		.limit(1);
	await notifyUser(orgId, row?.userId ?? null, subject, bodyHtml, linkPath, summary);
}

/** Notify the org's owners and admins (email respects the org's email toggle). */
export async function notifyOrgAdmins(
	orgId: string,
	subject: string,
	bodyHtml: string,
	linkPath?: string,
	summary?: string,
): Promise<void> {
	const admins = await getDb()
		.select({ userId: member.userId })
		.from(member)
		.where(
			and(
				eq(member.organizationId, orgId),
				inArray(member.role, ["owner", "admin"]),
			),
		);
	for (const admin of admins) {
		await notifyUser(orgId, admin.userId, subject, bodyHtml, linkPath, summary);
	}
}

/**
 * Notify the employee's supervisor; falls back to org owners/admins when the
 * employee has no supervisor (or the supervisor has no linked account).
 */
export async function notifySupervisors(
	orgId: string,
	employeeId: string,
	subject: string,
	bodyHtml: string,
	linkPath?: string,
	summary?: string,
): Promise<void> {
	const [row] = await getDb()
		.select({ supervisorId: employee.supervisorId })
		.from(employee)
		.where(and(eq(employee.id, employeeId), eq(employee.organizationId, orgId)))
		.limit(1);
	if (row?.supervisorId) {
		const [supervisor] = await getDb()
			.select({ userId: employee.userId })
			.from(employee)
			.where(eq(employee.id, row.supervisorId))
			.limit(1);
		if (supervisor?.userId) {
			await notifyUser(orgId, supervisor.userId, subject, bodyHtml, linkPath, summary);
			return;
		}
	}
	const admins = await getDb()
		.select({ userId: member.userId })
		.from(member)
		.where(
			and(
				eq(member.organizationId, orgId),
				inArray(member.role, ["owner", "admin"]),
			),
		);
	for (const admin of admins) {
		await notifyUser(orgId, admin.userId, subject, bodyHtml, linkPath, summary);
	}
}
