export type Shift = "normal" | "flexi";

export type Schedule = {
	workDays: number[];
	workStartMinutes: number;
	workEndMinutes: number;
	graceMinutes: number;
	timezone: string;
};

export type ClockInStatus = "on_time" | "late" | "manual";
export type ClockOutStatus = "complete" | "short" | "manual" | null;

export type ZonedParts = {
	year: number;
	month: number;
	day: number;
	weekday: number;
	minutesSinceMidnight: number;
};

const WEEKDAY_INDEX: Record<string, number> = {
	Sun: 0,
	Mon: 1,
	Tue: 2,
	Wed: 3,
	Thu: 4,
	Fri: 5,
	Sat: 6,
};

function zonedFormat(date: Date, timeZone: string): Record<string, string> {
	const formatter = new Intl.DateTimeFormat("en-US", {
		timeZone,
		hour12: false,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		weekday: "short",
	});
	return Object.fromEntries(
		formatter.formatToParts(date).map((part) => [part.type, part.value]),
	);
}

export function getZonedParts(date: Date, timeZone: string): ZonedParts {
	const parts = zonedFormat(date, timeZone);
	const hour = Number(parts.hour) % 24;
	return {
		year: Number(parts.year),
		month: Number(parts.month),
		day: Number(parts.day),
		weekday: WEEKDAY_INDEX[parts.weekday] ?? 0,
		minutesSinceMidnight: hour * 60 + Number(parts.minute),
	};
}

export function formatZonedDate(date: Date, timeZone: string): string {
	const { year, month, day } = getZonedParts(date, timeZone);
	const monthPart = String(month).padStart(2, "0");
	const dayPart = String(day).padStart(2, "0");
	return `${year}-${monthPart}-${dayPart}`;
}

function timeZoneOffsetMs(date: Date, timeZone: string): number {
	const parts = zonedFormat(date, timeZone);
	const hour = Number(parts.hour) % 24;
	const asUtc = Date.UTC(
		Number(parts.year),
		Number(parts.month) - 1,
		Number(parts.day),
		hour,
		Number(parts.minute),
	);
	return asUtc - date.getTime();
}

export function zonedWallTimeToUtc(
	date: string,
	minutes: number,
	timeZone: string,
): Date {
	const [year, month, day] = date.split("-").map(Number);
	const guess = Date.UTC(
		year,
		month - 1,
		day,
		Math.floor(minutes / 60),
		minutes % 60,
	);
	const offset = timeZoneOffsetMs(new Date(guess), timeZone);
	return new Date(guess - offset);
}

export function isWorkDay(date: Date, schedule: Schedule): boolean {
	return schedule.workDays.includes(
		getZonedParts(date, schedule.timezone).weekday,
	);
}

// per-employee schedule overrides — each field falls back to the org default
export type ScheduleOverride = {
	workDays: string | null;
	workStartMinutes: number | null;
	workEndMinutes: number | null;
	graceMinutes: number | null;
};

export const NO_SCHEDULE_OVERRIDE: ScheduleOverride = {
	workDays: null,
	workStartMinutes: null,
	workEndMinutes: null,
	graceMinutes: null,
};

export function resolveSchedule(
	override: ScheduleOverride | null,
	org: { workDays: string; workStartMinutes: number; workEndMinutes: number; graceMinutes: number },
): { workDays: number[]; workStartMinutes: number; workEndMinutes: number; graceMinutes: number } {
	const effective = override ?? NO_SCHEDULE_OVERRIDE;
	return {
		workDays: (effective.workDays ?? org.workDays)
			.split(",")
			.map(Number)
			.filter((day) => day >= 0 && day <= 6),
		workStartMinutes: effective.workStartMinutes ?? org.workStartMinutes,
		workEndMinutes: effective.workEndMinutes ?? org.workEndMinutes,
		graceMinutes: effective.graceMinutes ?? org.graceMinutes,
	};
}

export function computeClockInStatus(
	clockIn: Date,
	schedule: Schedule,
	shift: Shift,
): "on_time" | "late" {
	const { minutesSinceMidnight } = getZonedParts(clockIn, schedule.timezone);
	if (shift === "flexi") {
		return minutesSinceMidnight > schedule.workStartMinutes
			? "late"
			: "on_time";
	}
	return minutesSinceMidnight >
		schedule.workStartMinutes + schedule.graceMinutes
		? "late"
		: "on_time";
}

export function flexiTargetMinutes(schedule: Schedule): number {
	return schedule.workEndMinutes - schedule.workStartMinutes;
}

export function computeTargetClockOut(
	clockIn: Date,
	schedule: Schedule,
	shift: Shift,
): Date {
	if (shift === "flexi") {
		return new Date(
			clockIn.getTime() + flexiTargetMinutes(schedule) * 60 * 1000,
		);
	}
	const { year, month, day } = getZonedParts(clockIn, schedule.timezone);
	const monthPart = String(month).padStart(2, "0");
	const dayPart = String(day).padStart(2, "0");
	const dateKey = `${year}-${monthPart}-${dayPart}`;
	return zonedWallTimeToUtc(
		dateKey,
		schedule.workEndMinutes,
		schedule.timezone,
	);
}

export function computeClockOutStatus(
	clockOut: Date,
	targetClockOut: Date,
): "complete" | "short" {
	return clockOut.getTime() >= targetClockOut.getTime() ? "complete" : "short";
}

export function formatMinutes(minutes: number): string {
	const hour = Math.floor(minutes / 60);
	const minute = minutes % 60;
	return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function parseTimeToMinutes(time: string): number | null {
	const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
	if (!match) {
		return null;
	}
	const hour = Number(match[1]);
	const minute = Number(match[2]);
	if (hour > 23 || minute > 59) {
		return null;
	}
	return hour * 60 + minute;
}
