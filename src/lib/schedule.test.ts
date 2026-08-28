import { describe, expect, it } from "vitest";
import {
	computeClockInStatus,
	computeClockOutStatus,
	computeTargetClockOut,
	flexiTargetMinutes,
	formatMinutes,
	formatZonedDate,
	getZonedParts,
	isWorkDay,
	type Schedule,
	zonedWallTimeToUtc,
} from "./schedule";

const MYT: Schedule = {
	workDays: [1, 2, 3, 4, 5],
	workStartMinutes: 540,
	workEndMinutes: 1080,
	graceMinutes: 15,
	timezone: "Asia/Kuala_Lumpur",
};

describe("getZonedParts and date boundary", () => {
	it("rolls the local date across the UTC boundary (UTC 17:00 → next day MYT)", () => {
		expect(
			formatZonedDate(new Date("2026-08-27T17:00:00Z"), MYT.timezone),
		).toBe("2026-08-28");
	});

	it("keeps the same local date before the boundary", () => {
		expect(
			formatZonedDate(new Date("2026-08-27T15:59:00Z"), MYT.timezone),
		).toBe("2026-08-27");
	});

	it("computes minutes since midnight in org timezone", () => {
		expect(
			getZonedParts(new Date("2026-08-27T01:00:00Z"), MYT.timezone)
				.minutesSinceMidnight,
		).toBe(540);
	});

	it("maps weekdays correctly", () => {
		expect(
			getZonedParts(new Date("2026-08-27T01:00:00Z"), MYT.timezone).weekday,
		).toBe(4);
		expect(
			getZonedParts(new Date("2026-08-30T01:00:00Z"), MYT.timezone).weekday,
		).toBe(0);
	});
});

describe("zonedWallTimeToUtc", () => {
	it("converts local wall time to the correct UTC instant (+08:00)", () => {
		expect(
			zonedWallTimeToUtc("2026-08-27", 540, MYT.timezone).toISOString(),
		).toBe("2026-08-27T01:00:00.000Z");
	});
});

describe("isWorkDay", () => {
	it("marks weekdays as work days", () => {
		expect(isWorkDay(new Date("2026-08-27T01:00:00Z"), MYT)).toBe(true);
	});

	it("marks weekends as non-work days", () => {
		expect(isWorkDay(new Date("2026-08-29T01:00:00Z"), MYT)).toBe(false);
		expect(isWorkDay(new Date("2026-08-30T01:00:00Z"), MYT)).toBe(false);
	});
});

describe("computeClockInStatus — normal shift (grace 15 min)", () => {
	it("is on_time before the grace boundary (09:14)", () => {
		expect(
			computeClockInStatus(
				zonedWallTimeToUtc("2026-08-27", 554, MYT.timezone),
				MYT,
				"normal",
			),
		).toBe("on_time");
	});

	it("is on_time exactly at the grace boundary (09:15)", () => {
		expect(
			computeClockInStatus(
				zonedWallTimeToUtc("2026-08-27", 555, MYT.timezone),
				MYT,
				"normal",
			),
		).toBe("on_time");
	});

	it("is late after the grace boundary (09:16)", () => {
		expect(
			computeClockInStatus(
				zonedWallTimeToUtc("2026-08-27", 556, MYT.timezone),
				MYT,
				"normal",
			),
		).toBe("late");
	});
});

describe("computeClockInStatus — flexi shift (strict 09:00)", () => {
	it("is on_time at 08:59", () => {
		expect(
			computeClockInStatus(
				zonedWallTimeToUtc("2026-08-27", 539, MYT.timezone),
				MYT,
				"flexi",
			),
		).toBe("on_time");
	});

	it("is on_time exactly at 09:00", () => {
		expect(
			computeClockInStatus(
				zonedWallTimeToUtc("2026-08-27", 540, MYT.timezone),
				MYT,
				"flexi",
			),
		).toBe("on_time");
	});

	it("is late at 09:01 (no grace)", () => {
		expect(
			computeClockInStatus(
				zonedWallTimeToUtc("2026-08-27", 541, MYT.timezone),
				MYT,
				"flexi",
			),
		).toBe("late");
	});
});

describe("computeTargetClockOut", () => {
	it("normal shift targets the org end time on the same local day", () => {
		expect(
			computeTargetClockOut(
				zonedWallTimeToUtc("2026-08-27", 480, MYT.timezone),
				MYT,
				"normal",
			).toISOString(),
		).toBe("2026-08-27T10:00:00.000Z");
	});

	it("flexi shift targets clock-in plus the schedule span (08:00 in → 17:00 out)", () => {
		expect(
			computeTargetClockOut(
				zonedWallTimeToUtc("2026-08-27", 480, MYT.timezone),
				MYT,
				"flexi",
			).toISOString(),
		).toBe("2026-08-27T09:00:00.000Z");
	});

	it("flexi in at 09:00 targets 18:00", () => {
		expect(
			computeTargetClockOut(
				zonedWallTimeToUtc("2026-08-27", 540, MYT.timezone),
				MYT,
				"flexi",
			).toISOString(),
		).toBe("2026-08-27T10:00:00.000Z");
	});

	it("flexi span derives from the schedule (9 hours)", () => {
		expect(flexiTargetMinutes(MYT)).toBe(540);
	});
});

describe("computeClockOutStatus", () => {
	const target = zonedWallTimeToUtc("2026-08-27", 1020, MYT.timezone);

	it("is complete at or after the target", () => {
		expect(computeClockOutStatus(target, target)).toBe("complete");
		expect(
			computeClockOutStatus(new Date(target.getTime() + 60_000), target),
		).toBe("complete");
	});

	it("is short before the target", () => {
		expect(
			computeClockOutStatus(new Date(target.getTime() - 60_000), target),
		).toBe("short");
	});
});

describe("formatMinutes", () => {
	it("formats minutes as HH:MM", () => {
		expect(formatMinutes(540)).toBe("09:00");
		expect(formatMinutes(1080)).toBe("18:00");
	});
});
