import { eq } from "drizzle-orm";
import { getDb } from "#/db";
import { orgHoliday } from "#/db/schema";

/**
 * Public holidays for an organization, optionally clipped to a date range.
 * Holiday dates are treated as non-working days everywhere `workDays` is
 * consulted: no attendance expectation, excluded from leave-quota day counts.
 * Clock-in stays allowed on holidays.
 */
export async function getHolidayDates(
	orgId: string,
	rangeStart?: string,
	rangeEnd?: string,
): Promise<Set<string>> {
	const rows = await getDb()
		.select({ date: orgHoliday.date })
		.from(orgHoliday)
		.where(eq(orgHoliday.organizationId, orgId));
	const set = new Set<string>();
	for (const row of rows) {
		if (rangeStart && row.date < rangeStart) continue;
		if (rangeEnd && row.date > rangeEnd) continue;
		set.add(row.date);
	}
	return set;
}
