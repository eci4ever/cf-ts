import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { getDb } from "#/db";
import { employee, organization, workSite } from "#/db/schema";
import { getOrgMemberContext } from "./session";

async function requireOrgAdmin() {
	const context = await getOrgMemberContext();
	if (!context) {
		throw new Error("Unauthorized");
	}
	if (!["owner", "admin"].includes(context.role ?? "")) {
		throw new Error("Forbidden");
	}
	return context;
}

export const getGeofenceSettings = createServerFn({ method: "GET" }).handler(
	async () => {
		const context = await requireOrgAdmin();
		const sites = await getDb()
			.select({
				id: workSite.id,
				name: workSite.name,
				lat: workSite.lat,
				lng: workSite.lng,
				radiusM: workSite.radiusM,
			})
			.from(workSite)
			.where(eq(workSite.organizationId, context.orgId))
			.orderBy(workSite.createdAt);
		return {
			geofenceEnabled: context.org.geofenceEnabled,
			sites,
		};
	},
);

export const setGeofenceEnabled = createServerFn({ method: "POST" })
	.validator((input: { enabled: boolean }) => input)
	.handler(async ({ data }) => {
		const context = await requireOrgAdmin();
		await getDb()
			.update(organization)
			.set({ geofenceEnabled: data.enabled })
			.where(eq(organization.id, context.orgId));
		if (data.enabled) {
			const sites = await getDb()
				.select({ id: workSite.id })
				.from(workSite)
				.where(eq(workSite.organizationId, context.orgId));
			if (sites.length === 0) {
				await getDb().insert(workSite).values({
					id: crypto.randomUUID(),
					organizationId: context.orgId,
					name: "Main Office",
					lat: null,
					lng: null,
					radiusM: 100,
					createdAt: new Date(),
				});
			}
		}
		return { ok: true as const };
	});

export const saveWorkSite = createServerFn({ method: "POST" })
	.validator(
		(input: {
			siteId?: string;
			name: string;
			lat?: number | null;
			lng?: number | null;
			radiusM: number;
		}) => input,
	)
	.handler(async ({ data }) => {
		const context = await requireOrgAdmin();
		const name = data.name.trim();
		if (name.length < 1 || name.length > 40) {
			return { ok: false as const, reason: "Name must be 1–40 characters" };
		}
		const radiusM = Math.round(Number(data.radiusM));
		if (!Number.isFinite(radiusM) || radiusM < 20 || radiusM > 10_000) {
			return { ok: false as const, reason: "Radius must be 20–10000 meters" };
		}
		const lat =
			data.lat === null || data.lat === undefined ? null : Number(data.lat);
		const lng =
			data.lng === null || data.lng === undefined ? null : Number(data.lng);
		if (lat !== null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) {
			return {
				ok: false as const,
				reason: "Latitude must be between -90 and 90",
			};
		}
		if (lng !== null && (!Number.isFinite(lng) || lng < -180 || lng > 180)) {
			return {
				ok: false as const,
				reason: "Longitude must be between -180 and 180",
			};
		}

		if (data.siteId) {
			const [existing] = await getDb()
				.select({ id: workSite.id })
				.from(workSite)
				.where(
					and(
						eq(workSite.id, data.siteId),
						eq(workSite.organizationId, context.orgId),
					),
				)
				.limit(1);
			if (!existing) {
				return { ok: false as const, reason: "Site not found" };
			}
			await getDb()
				.update(workSite)
				.set({ name, lat, lng, radiusM })
				.where(eq(workSite.id, data.siteId));
			return { ok: true as const };
		}

		await getDb().insert(workSite).values({
			id: crypto.randomUUID(),
			organizationId: context.orgId,
			name,
			lat,
			lng,
			radiusM,
			createdAt: new Date(),
		});
		return { ok: true as const };
	});

export const deleteWorkSite = createServerFn({ method: "POST" })
	.validator((input: { siteId: string }) => input)
	.handler(async ({ data }) => {
		const context = await requireOrgAdmin();
		const [existing] = await getDb()
			.select({ id: workSite.id })
			.from(workSite)
			.where(
				and(
					eq(workSite.id, data.siteId),
					eq(workSite.organizationId, context.orgId),
				),
			)
			.limit(1);
		if (!existing) {
			return { ok: false as const, reason: "Site not found" };
		}
		const assigned = await getDb()
			.select({ id: employee.id })
			.from(employee)
			.where(eq(employee.siteId, data.siteId))
			.limit(1);
		if (assigned.length > 0) {
			return {
				ok: false as const,
				reason: "This site still has employees assigned — reassign them first",
			};
		}
		await getDb().delete(workSite).where(eq(workSite.id, data.siteId));
		return { ok: true as const };
	});
