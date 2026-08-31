type HeatDay = { date: string; status: string };

const STATUS_LABEL: Record<string, string> = {
	present: "Present",
	issue: "Attendance issue",
	absent: "Absent (issue)",
	leave: "On leave",
	today: "Not clocked in yet",
	off: "Rest day",
	empty: "No record",
};

const STATUS_CLASS: Record<string, string> = {
	present: "bg-primary",
	issue: "bg-amber-500",
	absent: "bg-destructive/80",
	leave: "bg-emerald-500",
	today: "border border-primary/40 bg-transparent",
	off: "bg-muted/40",
	empty: "bg-muted/50",
};

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
								<div
									key={cell.date}
									title={`${cell.date} — ${STATUS_LABEL[cell.status] ?? cell.status}`}
									className={`size-3 rounded-[3px] ${STATUS_CLASS[cell.status] ?? "bg-muted/50"}`}
								/>
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
