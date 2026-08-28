import { describe, expect, it } from "vitest";
import {
	addMonths,
	formatRm,
	GRACE_DAYS,
	PLANS,
	parseRmToSen,
	WARN_DAYS,
} from "./subscription";

describe("addMonths", () => {
	it("adds months within the same year", () => {
		const result = addMonths(new Date("2026-01-15T00:00:00Z"), 2);
		expect(result.getUTCFullYear()).toBe(2026);
		expect(result.getUTCMonth()).toBe(2);
		expect(result.getUTCDate()).toBe(15);
	});

	it("clamps end-of-month overflow (31 Jan + 1 month → 28 Feb)", () => {
		expect(addMonths(new Date("2026-01-31T00:00:00Z"), 1).toISOString()).toBe(
			"2026-02-28T00:00:00.000Z",
		);
	});

	it("clamps to leap-day boundary (28 Feb + 1 month → 31 Mar is NOT applied; stays 28 Mar)", () => {
		expect(addMonths(new Date("2024-02-28T00:00:00Z"), 1).toISOString()).toBe(
			"2024-03-28T00:00:00.000Z",
		);
	});

	it("preserves leap day within its own month (29 Feb + 1 month → 29 Mar)", () => {
		expect(addMonths(new Date("2024-02-29T00:00:00Z"), 1).toISOString()).toBe(
			"2024-03-29T00:00:00.000Z",
		);
	});

	it("rolls into the next year (31 Dec + 1 month → 31 Jan)", () => {
		expect(addMonths(new Date("2026-12-31T00:00:00Z"), 1).toISOString()).toBe(
			"2027-01-31T00:00:00.000Z",
		);
	});

	it("supports multi-month jumps (30 Jun + 3 months → 30 Sep)", () => {
		expect(addMonths(new Date("2026-06-30T00:00:00Z"), 3).toISOString()).toBe(
			"2026-09-30T00:00:00.000Z",
		);
	});
});

describe("formatRm", () => {
	it("formats zero", () => {
		expect(formatRm(0)).toBe("RM0.00");
	});

	it("formats sen to two decimals", () => {
		expect(formatRm(2900)).toBe("RM29.00");
		expect(formatRm(12345)).toMatch(/^RM123\.45$/);
	});

	it("formats fractional sen rounding (2955 → RM29.55)", () => {
		expect(formatRm(2955)).toBe("RM29.55");
	});
});

describe("parseRmToSen", () => {
	it("parses plain ringgit", () => {
		expect(parseRmToSen("29")).toBe(2900);
		expect(parseRmToSen("0")).toBe(0);
	});

	it("parses decimals", () => {
		expect(parseRmToSen("29.5")).toBe(2950);
		expect(parseRmToSen("29.55")).toBe(2955);
	});

	it("parses with RM prefix and whitespace", () => {
		expect(parseRmToSen("RM29")).toBe(2900);
		expect(parseRmToSen("  29.00  ")).toBe(2900);
	});

	it("rejects invalid input", () => {
		expect(parseRmToSen("abc")).toBeNull();
		expect(parseRmToSen("-5")).toBeNull();
		expect(parseRmToSen("29.555")).toBeNull();
		expect(parseRmToSen("29.")).toBeNull();
		expect(parseRmToSen("")).toBeNull();
	});
});

describe("plans and constants", () => {
	it("defines seat caps per plan", () => {
		expect(PLANS.free.maxEmployees).toBe(5);
		expect(PLANS.pro.maxEmployees).toBe(25);
		expect(PLANS.business.maxEmployees).toBeNull();
	});

	it("defines prices in sen", () => {
		expect(PLANS.free.priceSen).toBe(0);
		expect(PLANS.pro.priceSen).toBe(2900);
		expect(PLANS.business.priceSen).toBe(5900);
	});

	it("defines grace and warning windows of 7 days", () => {
		expect(GRACE_DAYS).toBe(7);
		expect(WARN_DAYS).toBe(7);
	});
});
