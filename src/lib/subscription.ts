export type PlanId = "free" | "pro" | "business";

export type PlanConfig = {
	id: PlanId;
	name: string;
	priceSen: number;
	maxEmployees: number | null;
};

export const PLANS: Record<PlanId, PlanConfig> = {
	free: { id: "free", name: "Free", priceSen: 0, maxEmployees: 5 },
	pro: { id: "pro", name: "Pro", priceSen: 2900, maxEmployees: 25 },
	business: {
		id: "business",
		name: "Business",
		priceSen: 5900,
		maxEmployees: null,
	},
};

export const PAID_PLANS: PlanId[] = ["pro", "business"];

export const SUBSCRIPTION_MONTHS = [1, 3, 6, 12] as const;

export const GRACE_DAYS = 7;
export const WARN_DAYS = 7;

export type LedgerType =
	| "topup"
	| "subscription_charge"
	| "adjustment"
	| "downgrade";

export type SubscriptionStatus = "active" | "warning" | "grace" | "downgraded";

const DAY_MS = 24 * 60 * 60 * 1000;
export const GRACE_MS = GRACE_DAYS * DAY_MS;
export const WARN_MS = WARN_DAYS * DAY_MS;

export function addMonths(date: Date, months: number): Date {
	const result = new Date(date.getTime());
	const day = result.getDate();
	result.setMonth(result.getMonth() + months);
	if (result.getDate() < day) {
		result.setDate(0);
	}
	return result;
}

export function formatRm(sen: number): string {
	const value = sen / 100;
	return `RM${value.toLocaleString("en-MY", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})}`;
}

export function parseRmToSen(input: string): number | null {
	const trimmed = input.trim().replace(/^RM/i, "");
	if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
		return null;
	}
	return Math.round(Number.parseFloat(trimmed) * 100);
}
