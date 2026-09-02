import { env } from "cloudflare:workers";
import { APIError, betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, organization, twoFactor } from "better-auth/plugins";
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
			minPasswordLength: 10,
			sendResetPassword: async ({ user, url }) => {				const brand = env.EMAIL_BRAND_NAME || "TapMe";
				await sendEmail({
					to: user.email,
					subject: `Reset your password on ${brand}`,
					html: `
						<p>Hi ${user.name},</p>
						<p>We received a request to reset your password for your ${brand} account.</p>
						<p><a href="${url}">Reset your password</a></p>
						<p>This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.</p>
					`,
				});
			},
		},
		emailVerification: {
			sendOnSignUp: true,
			autoSignInAfterVerification: true,
			sendVerificationEmail: async ({ user, url }) => {
				const brand = env.EMAIL_BRAND_NAME || "TapMe";
				await sendEmail({
					to: user.email,
					subject: `Verify your email address on ${brand}`,
					html: `
						<p>Hi ${user.name},</p>
						<p>Please verify your email address to activate your ${brand} account.</p>
						<p><a href="${url}">Verify email address</a></p>
					`,
				});
			},
		},
		rateLimit: {
			enabled: true,
			window: 60,
			max: 100,
			specialRules: [
				{
					matcher: (request: { path: string }) =>
						request.path === "/sign-in/email",
					window: 60,
					max: 5,
				},
				{
					matcher: (request: { path: string }) =>
						request.path === "/forget-password",
					window: 60,
					max: 3,
				},
			],
		},
		hooks: {
			before: createAuthMiddleware(async (ctx: { path: string; body?: { password?: unknown; newPassword?: unknown } }) => {
				if (
					ctx.path !== "/sign-up/email" &&
					ctx.path !== "/change-password" &&
					ctx.path !== "/reset-password"
				) {
					return;
				}
				const password =
					(ctx.body as { password?: unknown; newPassword?: unknown })
						?.password ??
					(ctx.body as { newPassword?: unknown })?.newPassword;
				if (typeof password !== "string") {
					return;
				}
				if (password.length < 10) {
					throw new APIError("BAD_REQUEST", {
						message: "Password must be at least 10 characters",
					});
				}
				if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
					throw new APIError("BAD_REQUEST", {
						message: "Password must contain both letters and numbers",
					});
				}
			}),
		},
		...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
			? {
					socialProviders: {
						google: {
							clientId: env.GOOGLE_CLIENT_ID,
							clientSecret: env.GOOGLE_CLIENT_SECRET,
						},
					},
				}
			: {}),
		account: {
			accountLinking: {
				enabled: true,
			},
		},
		user: {
			changeEmail: {
				enabled: true,
				sendChangeEmailConfirmation: async ({ newEmail, url }) => {
					const brand = env.EMAIL_BRAND_NAME || "TapMe";
					await sendEmail({
						to: newEmail,
						subject: `Confirm your new email address on ${brand}`,
						html: `
							<p>Hi,</p>
							<p>A request was made to change the email address on a ${brand} account to this address.</p>
							<p><a href="${url}">Confirm new email address</a></p>
							<p>This link expires in 1 hour. If you didn't request this, you can ignore this email — the address will stay unchanged.</p>
						`,
					});
				},
			},
		},
		plugins: [
			admin(),
			organization({
				sendInvitationEmail: async ({ invitation, organization }) => {
					const brand = env.EMAIL_BRAND_NAME || "TapMe";
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
			twoFactor({
				issuer: env.EMAIL_BRAND_NAME || "TapMe",
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
