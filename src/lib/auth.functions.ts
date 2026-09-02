import { env } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
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
