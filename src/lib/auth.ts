import { env } from "cloudflare:workers";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, organization } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { asc, eq } from "drizzle-orm";
import { getDb } from "#/db";
import * as schema from "#/db/schema";
import { member } from "#/db/schema";
import { sendEmail } from "./email";

function createAuth() {
	const baseURL = env.BETTER_AUTH_URL || "http://localhost:3000";
	return betterAuth({
		baseURL,
		database: drizzleAdapter(getDb(), {
			provider: "sqlite",
			schema,
		}),
		emailAndPassword: {
			enabled: true,
		},
		plugins: [
			admin(),
			organization({
				sendInvitationEmail: async ({ invitation, organization }) => {
					const brand = env.EMAIL_BRAND_NAME || "Attendance Management System";
					await sendEmail({
						to: invitation.email,
						subject: `You're invited to join ${organization.name} on ${brand}`,
						idempotencyKey: `invite/${invitation.id}`,
						html: `
							<p>Hi,</p>
							<p>You have been invited to join <strong>${organization.name}</strong> on ${brand} as <strong>${invitation.role ?? "member"}</strong>.</p>
							<p><a href="${baseURL}/onboarding">Accept your invitation</a> by signing in with this email address.</p>
							<p>This invitation expires on ${new Date(invitation.expiresAt).toUTCString()}.</p>
						`,
					});
				},
			}),
			tanstackStartCookies(),
		],
		databaseHooks: {
			session: {
				create: {
					before: async (session) => {
						const memberships = await getDb()
							.select({ organizationId: member.organizationId })
							.from(member)
							.where(eq(member.userId, session.userId))
							.orderBy(asc(member.createdAt))
							.limit(1);
						return {
							data: {
								...session,
								activeOrganizationId: memberships[0]?.organizationId ?? null,
							},
						};
					},
				},
			},
		},
	});
}

export type Auth = ReturnType<typeof createAuth>;

let instance: Auth | undefined;

export function getAuth(): Auth {
	instance ??= createAuth();
	return instance;
}
