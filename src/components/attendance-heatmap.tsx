import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "#/components/ui/popover";

type HeatDay = {
	date: string;
	status: string;
	clockIn: string | null;
	clockInStatus: string | null;
	clockOut: string | null;
	clockOutStatus: string | null;
	locationStatus: string | null;
	accuracyM: number | null;
	note: string | null;
	clockOutLocationStatus: string | null;
	clockOutAccuracyM: number | null;
	clockOutNote: string | null;
	issueTypes: string[];
};

const STATUS_LABEL: Record<string, string> = {
	present: "Present",
	issue: "Attendance issue",
	absent: "Absent (issue)",
	leave: "On leave",
	holiday: "Public holiday",
	today: "Not clocked in yet",
	off: "Rest day",
	empty: "No record",
};

const STATUS_CLASS: Record<string, string> = {
	present: "bg-primary",
	issue: "bg-amber-500",
	absent: "bg-destructive/80",
	leave: "bg-emerald-500",
	holiday: "bg-sky-400",
	today: "border border-primary/40 bg-transparent",
	off: "bg-muted/40",
	empty: "bg-muted/50",
};

const CLOCK_IN_LABEL: Record<string, string> = {
	on_time: "On time",
	late: "Late",
	manual: "Manual",
};

const CLOCK_OUT_LABEL: Record<string, string> = {
	complete: "Complete",
	short: "Short",
	manual: "Manual",
};

const LOCATION_LABEL: Record<string, string> = {
	inside: "On site",
	outside: "Off site",
};

const ISSUE_TYPE_LABEL: Record<string, string> = {
	outside: "Outside geofence",
};

function formatDayLabel(dateKey: string): string {
	return new Date(`${dateKey}T00:00:00Z`).toLocaleDateString("en-US", {
		weekday: "short",
		day: "numeric",
		month: "short",
		year: "numeric",
		timeZone: "UTC",
	});
}

function LocationBadge({
	status,
	accuracyM,
}: {
	status: string | null;
	accuracyM?: number | null;
}) {
	if (!status) {
		return null;
	}
	return (
		<span
			className={`rounded px-1 py-0.5 text-[10px] ${
				status === "outside"
					? "bg-destructive/10 text-destructive"
					: "bg-muted text-muted-foreground"
			}`}
			title={accuracyM ? `GPS accuracy ±${Math.round(accuracyM)}m` : undefined}
		>
			{LOCATION_LABEL[status] ?? status}
			{accuracyM ? ` ±${Math.round(accuracyM)}m` : ""}
		</span>
	);
}

function DayDetailPopover({
	day,
	children,
}: {
	day: HeatDay;
	children: React.ReactNode;
}) {
	return (
		<Popover>
			<PopoverTrigger asChild>{children}</PopoverTrigger>
			<PopoverContent className="w-56 p-3 text-xs">
				<p className="font-medium">{formatDayLabel(day.date)}</p>
				<p className="text-muted-foreground">
					{STATUS_LABEL[day.status] ?? day.status}
				</p>
				{day.clockIn || day.clockOut ? (
					<div className="mt-2 flex flex-col gap-1">
						{day.clockIn && (
							<div className="flex items-center gap-1.5">
								<span className="text-muted-foreground">In</span>
								<span className="font-medium tabular-nums">{day.clockIn}</span>
								{day.clockInStatus && (
									<span
										className={
											day.clockInStatus === "late"
												? "text-amber-600 dark:text-amber-400"
												: "text-muted-foreground"
										}
									>
										{CLOCK_IN_LABEL[day.clockInStatus] ?? day.clockInStatus}
									</span>
								)}
								<LocationBadge
									status={day.locationStatus}
									accuracyM={day.accuracyM}
								/>
							</div>
						)}
						{day.clockOut && (
							<div className="flex items-center gap-1.5">
								<span className="text-muted-foreground">Out</span>
								<span className="font-medium tabular-nums">{day.clockOut}</span>
								{day.clockOutStatus && (
									<span
										className={
											day.clockOutStatus === "short"
												? "text-amber-600 dark:text-amber-400"
												: "text-muted-foreground"
										}
									>
										{CLOCK_OUT_LABEL[day.clockOutStatus] ?? day.clockOutStatus}
									</span>
								)}
								<LocationBadge
									status={day.clockOutLocationStatus}
									accuracyM={day.clockOutAccuracyM}
								/>
							</div>
						)}
					</div>
				) : null}
				{day.note ? (
					<p className="mt-2 text-muted-foreground">Note: {day.note}</p>
				) : null}
				{day.clockOutNote ? (
					<p className="mt-1 text-muted-foreground">
						Clock-out note: {day.clockOutNote}
					</p>
				) : null}
				{day.issueTypes.length > 0 && (
					<p className="mt-2 text-destructive">
						Issue:{" "}
						{day.issueTypes
							.map((type) => ISSUE_TYPE_LABEL[type] ?? type)
							.join(", ")}
					</p>
				)}
			</PopoverContent>
		</Popover>
	);
}

function mondayOffset(dateKey: string): number {
	const utc = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
	return (utc + 6) % 7;
}

export function AttendanceHeatmap({ days }: { days: HeatDay[] }) {
	if (days.length === 0) {
		return (
			<p className="text-sm text-muted-foreground">
				No attendance data yet — clock in to start filling your heatmap.
			</p>
		);
	}

	const offset = mondayOffset(days[0].date);
	const cells: (HeatDay | null)[] = [
		...Array.from({ length: offset }, () => null),
		...days,
	];
	while (cells.length % 7 !== 0) {
		cells.push(null);
	}
	const weeks = cells.length / 7;

	// label bulan: lajur pertama setiap bulan baru
	const weekMonths: (string | null)[] = [];
	let lastMonth = "";
	for (let week = 0; week < weeks; week += 1) {
		const firstDay = cells
			.slice(week * 7, week * 7 + 7)
			.find((cell) => cell !== null);
		if (!firstDay) {
			weekMonths.push(null);
			continue;
		}
		const month = firstDay.date.slice(5, 7);
		if (month !== lastMonth) {
			lastMonth = month;
			weekMonths.push(
				new Date(`${firstDay.date}T00:00:00Z`).toLocaleDateString("en-US", {
					month: "short",
					timeZone: "UTC",
				}),
			);
		} else {
			weekMonths.push(null);
		}
	}

	const present = days.filter((day) => day.status === "present").length;
	const issues = days.filter(
		(day) => day.status === "issue" || day.status === "absent",
	).length;
	const leaves = days.filter((day) => day.status === "leave").length;
	const summary = `${present} present · ${issues} with issue · ${leaves} leave`;

	return (
		<div className="flex flex-col gap-2">
			<p className="text-xs text-muted-foreground">{summary}</p>
			<div className="flex flex-col gap-1.5 overflow-x-auto pb-1">
				<div className="flex gap-[3px] pl-6">
					{weekMonths.map((label, index) => (
						<span key={index} className="w-3 text-[9px] text-muted-foreground">
							{label ?? ""}
						</span>
					))}
				</div>
				<div className="flex gap-1.5">
					<div className="grid grid-rows-7 gap-[3px] text-[9px] leading-3 text-muted-foreground">
						<span>Mon</span>
						<span />
						<span>Wed</span>
						<span />
						<span>Fri</span>
						<span />
						<span />
					</div>
					<div className="grid grid-flow-col grid-rows-7 gap-[3px]">
						{cells.map((cell, index) =>
							cell ? (
								<DayDetailPopover key={cell.date} day={cell}>
									<button
										type="button"
										aria-label={`${cell.date} — ${STATUS_LABEL[cell.status] ?? cell.status}`}
										className={`size-3 cursor-pointer rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-ring ${STATUS_CLASS[cell.status] ?? "bg-muted/50"}`}
									/>
								</DayDetailPopover>
							) : (
								<div key={`pad-${index}`} className="size-3" />
							),
						)}
					</div>
				</div>
			</div>
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
				{[
					["present", "Present"],
					["issue", "Attendance issue"],
					["absent", "Absent"],
					["leave", "Leave"],
					["holiday", "Public holiday"],
					["off", "Rest day"],
					["empty", "No record"],
				].map(([status, label]) => (
					<span key={status} className="flex items-center gap-1">
						<span
							className={`size-2.5 rounded-[2px] ${STATUS_CLASS[status]}`}
						/>
						{label}
					</span>
				))}
			</div>
		</div>
	);
}
