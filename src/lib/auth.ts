import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, organization } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { eq } from "drizzle-orm";
import { getDb } from "#/db";
import * as schema from "#/db/schema";
import { member } from "#/db/schema";

function createAuth() {
	return betterAuth({
		database: drizzleAdapter(getDb(), {
			provider: "sqlite",
			schema,
		}),
		emailAndPassword: {
			enabled: true,
		},
		plugins: [admin(), organization(), tanstackStartCookies()],
		databaseHooks: {
			user: {
				create: {
					after: async (user) => {
						await getAuth().api.createOrganization({
							body: {
								name: `${user.name}'s workspace`,
								slug: `${user.name
									.toLowerCase()
									.replace(/[^a-z0-9]+/g, "-")
									.replace(/(^-|-$)/g, "")
									.slice(0, 32)}-${crypto.randomUUID().slice(0, 8)}`,
								userId: user.id,
							},
						});
					},
				},
			},
			session: {
				create: {
					before: async (session) => {
						const memberships = await getDb()
							.select({ organizationId: member.organizationId })
							.from(member)
							.where(eq(member.userId, session.userId))
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
