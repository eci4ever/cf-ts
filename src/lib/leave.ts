export type IssueType = "late" | "short" | "missing_out" | "absent";

export function isValidDateKey(value: string): boolean {
	return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function toUtcDate(dateKey: string): Date {
	const [year, month, day] = dateKey.split("-").map(Number);
	return new Date(Date.UTC(year, month - 1, day));
}

export function weekdayOf(dateKey: string): number {
	return toUtcDate(dateKey).getUTCDay();
}

export function enumerateDays(startDate: string, endDate: string): string[] {
	if (!isValidDateKey(startDate) || !isValidDateKey(endDate)) {
		return [];
	}
	const start = toUtcDate(startDate);
	const end = toUtcDate(endDate);
	if (start.getTime() > end.getTime()) {
		return [];
	}
	const days: string[] = [];
	const cursor = new Date(start.getTime());
	while (cursor.getTime() <= end.getTime()) {
		days.push(cursor.toISOString().slice(0, 10));
		cursor.setUTCDate(cursor.getUTCDate() + 1);
	}
	return days;
}

export function countWorkingDays(
	startDate: string,
	endDate: string,
	workDays: number[],
): number {
	return enumerateDays(startDate, endDate).filter((dateKey) =>
		workDays.includes(weekdayOf(dateKey)),
	).length;
}

export function rangesOverlap(
	aStart: string,
	aEnd: string,
	bStart: string,
	bEnd: string,
): boolean {
	return aStart <= bEnd && bStart <= aEnd;
}

export type AttendanceRecordSnapshot = {
	date: string;
	clockInStatus: string;
	clockOutStatus: string | null;
	clockOut: Date | null;
};

export type DerivedIssue = {
	date: string;
	type: IssueType;
};

export function deriveIssues(options: {
	records: AttendanceRecordSnapshot[];
	leaveCoveredDates: Set<string>;
	workDays: number[];
	rangeStart: string;
	rangeEnd: string;
	today: string;
}): DerivedIssue[] {
	const { records, leaveCoveredDates, workDays, rangeStart, rangeEnd, today } =
		options;
	const issues: DerivedIssue[] = [];
	const recordByDate = new Map(records.map((record) => [record.date, record]));
	for (const dateKey of enumerateDays(rangeStart, rangeEnd)) {
		if (dateKey >= today) {
			continue;
		}
		if (!workDays.includes(weekdayOf(dateKey))) {
			continue;
		}
		if (leaveCoveredDates.has(dateKey)) {
			continue;
		}
		const record = recordByDate.get(dateKey);
		if (!record) {
			issues.push({ date: dateKey, type: "absent" });
			continue;
		}
		if (record.clockInStatus === "late") {
			issues.push({ date: dateKey, type: "late" });
		}
		if (!record.clockOut) {
			issues.push({ date: dateKey, type: "missing_out" });
		} else if (record.clockOutStatus === "short") {
			issues.push({ date: dateKey, type: "short" });
		}
	}
	return issues;
}
