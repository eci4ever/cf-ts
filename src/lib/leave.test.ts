import { describe, expect, it } from "vitest";
import {
	countWorkingDays,
	deriveIssues,
	enumerateDays,
	isValidDateKey,
	rangesOverlap,
	weekdayOf,
} from "./leave";

const WEEKDAYS = [1, 2, 3, 4, 5];

describe("isValidDateKey", () => {
	it("accepts YYYY-MM-DD only", () => {
		expect(isValidDateKey("2026-08-27")).toBe(true);
		expect(isValidDateKey("2026-8-27")).toBe(false);
		expect(isValidDateKey("abc")).toBe(false);
	});
});

describe("weekdayOf", () => {
	it("returns UTC weekday of the calendar date", () => {
		expect(weekdayOf("2026-08-27")).toBe(4);
		expect(weekdayOf("2026-08-30")).toBe(0);
	});
});

describe("enumerateDays", () => {
	it("enumerates inclusive ranges", () => {
		expect(enumerateDays("2026-08-27", "2026-08-29")).toEqual([
			"2026-08-27",
			"2026-08-28",
			"2026-08-29",
		]);
	});

	it("returns single day for equal bounds", () => {
		expect(enumerateDays("2026-08-27", "2026-08-27")).toEqual(["2026-08-27"]);
	});

	it("returns empty for reversed bounds or invalid input", () => {
		expect(enumerateDays("2026-08-29", "2026-08-27")).toEqual([]);
		expect(enumerateDays("bad", "2026-08-27")).toEqual([]);
	});
});

describe("countWorkingDays", () => {
	it("counts only configured work days", () => {
		expect(countWorkingDays("2026-08-24", "2026-08-30", WEEKDAYS)).toBe(5);
	});

	it("returns 0 for a weekend-only range", () => {
		expect(countWorkingDays("2026-08-29", "2026-08-30", WEEKDAYS)).toBe(0);
	});

	it("handles a single day", () => {
		expect(countWorkingDays("2026-08-27", "2026-08-27", WEEKDAYS)).toBe(1);
	});

	it("excludes public holidays from the count", () => {
		const holidays = new Set(["2026-08-27"]);
		expect(
			countWorkingDays("2026-08-24", "2026-08-30", WEEKDAYS, holidays),
		).toBe(4);
		expect(countWorkingDays("2026-08-27", "2026-08-27", WEEKDAYS, holidays)).toBe(
			0,
		);
	});

	it("ignores holidays falling on non-work days", () => {
		const holidays = new Set(["2026-08-30"]); // Sunday
		expect(
			countWorkingDays("2026-08-24", "2026-08-30", WEEKDAYS, holidays),
		).toBe(5);
	});
});

describe("rangesOverlap", () => {
	it("detects overlapping and touching ranges", () => {
		expect(
			rangesOverlap("2026-08-10", "2026-08-15", "2026-08-14", "2026-08-20"),
		).toBe(true);
		expect(
			rangesOverlap("2026-08-10", "2026-08-15", "2026-08-15", "2026-08-20"),
		).toBe(true);
	});

	it("rejects disjoint ranges", () => {
		expect(
			rangesOverlap("2026-08-10", "2026-08-15", "2026-08-16", "2026-08-20"),
		).toBe(false);
	});
});

describe("deriveIssues", () => {
	const range = {
		rangeStart: "2026-08-24",
		rangeEnd: "2026-08-28",
		today: "2026-08-29",
	};

	it("flags absent for missing records on work days", () => {
		const issues = deriveIssues({
			records: [],
			leaveCoveredDates: new Set(),
			workDays: WEEKDAYS,
			...range,
		});
		expect(issues).toEqual([
			{ date: "2026-08-24", type: "absent" },
			{ date: "2026-08-25", type: "absent" },
			{ date: "2026-08-26", type: "absent" },
			{ date: "2026-08-27", type: "absent" },
			{ date: "2026-08-28", type: "absent" },
		]);
	});

	it("flags late, short and missing_out from records", () => {
		const issues = deriveIssues({
			records: [
				{
					date: "2026-08-24",
					clockInStatus: "late",
					clockOutStatus: "complete",
					clockOut: new Date(),
				},
				{
					date: "2026-08-25",
					clockInStatus: "on_time",
					clockOutStatus: "short",
					clockOut: new Date(),
				},
				{
					date: "2026-08-26",
					clockInStatus: "on_time",
					clockOutStatus: null,
					clockOut: null,
				},
				{
					date: "2026-08-27",
					clockInStatus: "on_time",
					clockOutStatus: "complete",
					clockOut: new Date(),
				},
			],
			leaveCoveredDates: new Set(),
			workDays: WEEKDAYS,
			...range,
		});
		expect(issues).toEqual([
			{ date: "2026-08-24", type: "late" },
			{ date: "2026-08-25", type: "short" },
			{ date: "2026-08-26", type: "missing_out" },
			{ date: "2026-08-28", type: "absent" },
		]);
	});

	it("excludes approved leave dates and non-work days", () => {
		const issues = deriveIssues({
			records: [],
			leaveCoveredDates: new Set(["2026-08-24", "2026-08-25"]),
			workDays: WEEKDAYS,
			...range,
		});
		expect(issues).toEqual([
			{ date: "2026-08-26", type: "absent" },
			{ date: "2026-08-27", type: "absent" },
			{ date: "2026-08-28", type: "absent" },
		]);
	});

	it("never flags absent on public holidays", () => {
		const issues = deriveIssues({
			records: [],
			leaveCoveredDates: new Set(),
			workDays: WEEKDAYS,
			holidayDates: new Set(["2026-08-26", "2026-08-27"]),
			...range,
		});
		expect(issues).toEqual([
			{ date: "2026-08-24", type: "absent" },
			{ date: "2026-08-25", type: "absent" },
			{ date: "2026-08-28", type: "absent" },
		]);
	});

	it("never flags today or the future", () => {
		const issues = deriveIssues({
			records: [],
			leaveCoveredDates: new Set(),
			workDays: WEEKDAYS,
			rangeStart: "2026-08-24",
			rangeEnd: "2026-08-30",
			today: "2026-08-28",
		});
		expect(issues.map((issue) => issue.date)).not.toContain("2026-08-28");
		expect(issues.map((issue) => issue.date)).not.toContain("2026-08-30");
		expect(issues.map((issue) => issue.date)).not.toContain("2026-08-29");
	});
});
