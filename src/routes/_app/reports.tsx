import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import {
	ChevronLeft,
	ChevronRight,
	Download,
	FileSpreadsheet,
} from "lucide-react";
import { useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { DataTable } from "#/components/data-table/data-table";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { getMonthlyReport } from "#/lib/reports.functions";

export const Route = createFileRoute("/_app/reports")({
	staticData: { title: "Reports" },
	component: ReportsPage,
});

type ReportIssue = {
	date: string;
	type: string;
	justification: string | null;
	status: string;
	reviewNote: string | null;
};

type DailyRow = {
	date: string;
	weekday: string;
	status: string;
	clockIn: string | null;
	clockOut: string | null;
	hours: number | null;
	note: string | null;
};

type ReportRow = {
	employeeId: string;
	name: string;
	employeeNo: string;
	workingDays: number;
	present: number;
	late: number;
	earlyOut: number;
	missingOut: number;
	absent: number;
	issueCount: number;
	leaveDays: Record<string, number>;
	balanceRemaining: Record<string, number | null>;
};

type ReportData = {
	scope: "all" | "subordinates" | "self" | "none";
	month: number;
	year: number;
	balanceYear: string;
	orgName: string;
	orgLogo: string | null;
	leaveTypes: { id: string; name: string; quotaDays: number | null }[];
	rows: ReportRow[];
	issuesByEmployee: Record<string, ReportIssue[]>;
	dailyByEmployee: Record<string, DailyRow[]>;
};

type Cursor = { year: number; month: number };

const DAILY_STATUS: Record<string, { label: string; className: string }> = {
	present: { label: "Present", className: "" },
	late: { label: "Late", className: "text-amber-600 dark:text-amber-400" },
	leave: { label: "On leave", className: "text-emerald-600 dark:text-emerald-400" },
	holiday: { label: "Public holiday", className: "text-sky-600 dark:text-sky-400" },
	off: { label: "Rest day", className: "text-muted-foreground" },
	absent: { label: "Absent", className: "text-destructive" },
	today: { label: "Not clocked in", className: "text-muted-foreground" },
	upcoming: { label: "—", className: "text-muted-foreground" },
};

function DailyStatusBadge({ status }: { status: string }) {
	const config = DAILY_STATUS[status] ?? { label: status, className: "" };
	return <span className={config.className}>{config.label}</span>;
}

function monthLabel(cursor: Cursor): string {
	return new Date(
		Date.UTC(cursor.year, cursor.month - 1, 1),
	).toLocaleDateString("en-US", {
		month: "long",
		year: "numeric",
		timeZone: "UTC",
	});
}

function shiftMonth(cursor: Cursor, delta: number): Cursor {
	const total = cursor.year * 12 + (cursor.month - 1) + delta;
	return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

function ReportsPage() {
	const [cursor, setCursor] = useState<Cursor>(() => {
		const now = new Date();
		return { year: now.getFullYear(), month: now.getMonth() + 1 };
	});
	const reportQuery = useQuery({
		queryKey: ["reports", "monthly", cursor.year, cursor.month],
		queryFn: () =>
			getMonthlyReport({
				data: { year: cursor.year, month: cursor.month },
			}) as Promise<ReportData>,
	});
	const data = reportQuery.data ?? null;
	const loading = reportQuery.isPending;

	const [employeeFilter, setEmployeeFilter] = useState<string>("all");
	const allRows = data?.rows ?? [];
	const rows =
		employeeFilter === "all"
			? allRows
			: allRows.filter((row) => row.employeeId === employeeFilter);
	const selectedEmployee = allRows.find(
		(row) => row.employeeId === employeeFilter,
	);
	const filteredIssues =
		employeeFilter === "all"
			? Object.entries(data?.issuesByEmployee ?? {})
			: Object.entries(data?.issuesByEmployee ?? {}).filter(
					([employeeId]) => employeeId === employeeFilter,
				);
	const [issueTypeFilter, setIssueTypeFilter] = useState<string>("all");
	const [issueStatusFilter, setIssueStatusFilter] = useState<string>("all");
	const flatIssues = useMemo(() => {
		const employeeById = new Map(
			allRows.map((row) => [row.employeeId, row] as const),
		);
		return filteredIssues.flatMap(([employeeId, issues]) => {
			const employee = employeeById.get(employeeId);
			return issues.map((issue) => ({
				...issue,
				employeeName: employee ? employee.name : employeeId,
				employeeNo: employee?.employeeNo ?? "",
			}));
		});
	}, [filteredIssues, allRows]);
	const issueTypes = useMemo(
		() => [...new Set(flatIssues.map((issue) => issue.type))].sort(),
		[flatIssues],
	);
	const visibleIssues = flatIssues.filter(
		(issue) =>
			(issueTypeFilter === "all" || issue.type === issueTypeFilter) &&
			(issueStatusFilter === "all" || issue.status === issueStatusFilter),
	);
	const columns = useMemo<ColumnDef<ReportRow>[]>(() => {
		const base: ColumnDef<ReportRow>[] = [
			{
				accessorKey: "name",
				header: "Employee",
				cell: (info) => (
					<span className="font-medium">
						{info.row.original.name}
						<span className="ml-2 text-xs text-muted-foreground">
							{info.row.original.employeeNo}
						</span>
					</span>
				),
			},
			{ accessorKey: "workingDays", header: "Work days" },
			{ accessorKey: "present", header: "Present" },
			{ accessorKey: "late", header: "Late" },
			{ accessorKey: "earlyOut", header: "Early out" },
			{ accessorKey: "missingOut", header: "Missing out" },
			{ accessorKey: "absent", header: "Absent" },
		];
		if (!data) {
			return base;
		}
		const issueColumn: ColumnDef<ReportRow> = {
			accessorKey: "issueCount",
			header: "Issues",
			cell: (info) => {
				const row = info.row.original;
				if (row.issueCount === 0) {
					return <span className="text-muted-foreground">—</span>;
				}
				const rowIssues = data.issuesByEmployee[row.employeeId] ?? [];
				const counts = rowIssues.reduce<Record<string, number>>(
					(acc, issue) => {
						acc[issue.status] = (acc[issue.status] ?? 0) + 1;
						return acc;
					},
					{},
				);
				const breakdown = ["open", "pending", "verified", "rejected"]
					.filter((status) => counts[status])
					.map((status) => `${counts[status]} ${status}`)
					.join(", ");
				return (
					<span title={breakdown} className="tabular-nums">
						{row.issueCount}
						<span className="ml-1 text-xs text-muted-foreground">
							({breakdown})
						</span>
					</span>
				);
			},
		};
		if (!data) {
			return base;
		}
		const takenGroup: ColumnDef<ReportRow> = {
			header: `Leave taken — ${monthLabel(cursor)}`,
			columns: data.leaveTypes.map((type) => ({
				id: `leave_${type.id}`,
				accessorFn: (row) => row.leaveDays[type.id] ?? 0,
				header: type.name,
			})),
		};
		const balanceGroup: ColumnDef<ReportRow> = {
			header: `Balance (${data.balanceYear})`,
			columns: data.leaveTypes.map((type) => ({
				id: `balance_${type.id}`,
				accessorFn: (row) =>
					row.balanceRemaining[type.id] === null
						? "∞"
						: (row.balanceRemaining[type.id] ?? ""),
				header: type.name,
			})),
		};
		return [...base, issueColumn, takenGroup, balanceGroup];
	}, [data, cursor]);

	const leafCount = 8 + 2 * (data?.leaveTypes.length ?? 0);

	const table = useReactTable({
		data: rows,
		columns,
		getCoreRowModel: getCoreRowModel(),
	});

	async function downloadCsv() {
		if (!data) {
			return;
		}
		const escape = (value: unknown) => {
			const text = String(value ?? "");
			return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
		};
		const header = [
			"Employee No",
			"Name",
			"Work days",
			"Present",
			"Late",
			"Early out",
			"Missing out",
			"Absent",
			"Issues",
			...data.leaveTypes.flatMap((type) => [
				`${type.name} (days)`,
				`${type.name} (balance)`,
			]),
		];
		const lines = [header.map(escape).join(",")];
		for (const row of rows) {
			lines.push(
				[
					row.employeeNo,
					row.name,
					row.workingDays,
					row.present,
					row.late,
					row.earlyOut,
					row.missingOut,
					row.absent,
					row.issueCount,
					...data.leaveTypes.flatMap((type) => [
						row.leaveDays[type.id] ?? 0,
						row.balanceRemaining[type.id] ?? "unlimited",
					]),
				]
					.map(escape)
					.join(","),
			);
		}
		// UTF-8 BOM so Excel opens the file with correct encoding
		const blob = new Blob([`\uFEFF${lines.join("\r\n")}`], {
			type: "text/csv;charset=utf-8",
		});
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = `report-${data.year}-${String(data.month).padStart(2, "0")}${
			selectedEmployee ? `-${selectedEmployee.employeeNo}` : ""
		}.csv`;
		anchor.click();
		URL.revokeObjectURL(url);
	}

	async function downloadPdf() {
		if (!data) {
			return;
		}
		const doc = new jsPDF({ orientation: "landscape", unit: "pt" });
		const pageHeight = doc.internal.pageSize.getHeight();
		const pageWidth = doc.internal.pageSize.getWidth();

		// logo top-right (silently skipped if it cannot be loaded)
		if (data.orgLogo) {
			try {
				const response = await fetch(data.orgLogo);
				const blob = await response.blob();
				const dataUrl = await new Promise<string>((resolve, reject) => {
					const reader = new FileReader();
					reader.onload = () => resolve(String(reader.result));
					reader.onerror = () => reject(new Error("read failed"));
					reader.readAsDataURL(blob);
				});
				const format = dataUrl.includes("image/png")
					? "PNG"
					: dataUrl.includes("image/webp")
						? "WEBP"
						: "JPEG";
				doc.addImage(dataUrl, format, pageWidth - 140, 24, 100, 44);
			} catch {
				// logo is decorative — continue without it
			}
		}

		doc.setFontSize(14);
		doc.text(`${data.orgName} — Monthly Attendance Report`, 40, 40);
		doc.setFontSize(10);
		doc.text(
			`${monthLabel(cursor)} · balance year ${data.balanceYear} · generated ${new Date().toLocaleDateString()}` +
				(selectedEmployee ? ` · ${selectedEmployee.name} (${selectedEmployee.employeeNo})` : ""),
			40,
			56,
		);

		const drawSectionTitle = (title: string, y: number): number => {
			doc.setFontSize(12);
			if (y > pageHeight - 120) {
				doc.addPage();
				y = 40;
			}
			doc.text(title, 40, y);
			return y + 14;
		};

		const summaryHead = [
			[
				"Employee No",
				"Name",
				"Work days",
				"Present",
				"Late",
				"Early out",
				"Missing out",
				"Absent",
				"Issues",
				...data.leaveTypes.flatMap((type) => [
					`${type.name} (days)`,
					`${type.name} (balance)`,
				]),
			],
		];
		const summaryBody = rows.map((row) => [
			row.employeeNo,
			row.name,
			row.workingDays,
			row.present,
			row.late,
			row.earlyOut,
			row.missingOut,
			row.absent,
			row.issueCount,
			...data.leaveTypes.flatMap((type) => [
				row.leaveDays[type.id] ?? 0,
				row.balanceRemaining[type.id] ?? "∞",
			]),
		]);
		autoTable(doc, {
			head: summaryHead,
			body: summaryBody,
			startY: 76,
			styles: { fontSize: 8, cellPadding: 3 },
			headStyles: { fillColor: [60, 60, 60] },
		});

		let cursorY =
			(doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
				?.finalY ?? 76;

		if (selectedEmployee) {
			const daily = data.dailyByEmployee[selectedEmployee.employeeId] ?? [];
			cursorY = drawSectionTitle(
				`Daily register — ${selectedEmployee.name} (${selectedEmployee.employeeNo})`,
				cursorY + 24,
			);
			autoTable(doc, {
				head: [["Date", "Day", "Status", "In", "Out", "Hours", "Note"]],
				body: daily.map((day) => [
					day.date,
					day.weekday,
					DAILY_STATUS[day.status]?.label ?? day.status,
					day.clockIn ?? "—",
					day.clockOut ?? "—",
					day.hours ?? "—",
					day.note ?? "",
				]),
				startY: cursorY,
				styles: { fontSize: 8, cellPadding: 3 },
				headStyles: { fillColor: [30, 90, 140] },
			});
			cursorY =
				(doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
					?.finalY ?? cursorY;
		}

		const issueRows = filteredIssues.flatMap(([employeeId, issues]) => {
			const employee = allRows.find((row) => row.employeeId === employeeId);
			return issues.map((issue) => [
				employee ? `${employee.name} (${employee.employeeNo})` : employeeId,
				issue.date,
				issue.type.replace(/_/g, " "),
				issue.justification ?? "—",
				issue.status,
				issue.reviewNote ?? "—",
			]);
		});
		if (issueRows.length > 0) {
			cursorY = drawSectionTitle("Attendance Issues", cursorY + 24);
			autoTable(doc, {
				head: [
					[
						"Employee",
						"Date",
						"Issue",
						"Justification",
						"Status",
						"Reviewer note",
					],
				],
				body: issueRows,
				startY: cursorY,
				styles: { fontSize: 8, cellPadding: 3 },
				headStyles: { fillColor: [140, 60, 20] },
			});
		}

		const suffix = selectedEmployee
			? `-${selectedEmployee.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`
			: "";
		doc.save(`report-${data.year}-${String(data.month).padStart(2, "0")}${suffix}.pdf`);
	}

	const now = new Date();
	const isCurrentMonth =
		cursor.year === now.getFullYear() && cursor.month === now.getMonth() + 1;

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center gap-2">
				<Button
					variant="outline"
					size="sm"
					aria-label="Previous month"
					onClick={() => setCursor((value) => shiftMonth(value, -1))}
				>
					<ChevronLeft />
				</Button>
				<span className="min-w-36 text-center text-sm font-medium">
					{monthLabel(cursor)}
				</span>
				<Button
					variant="outline"
					size="sm"
					aria-label="Next month"
					disabled={isCurrentMonth}
					onClick={() => setCursor((value) => shiftMonth(value, 1))}
				>
					<ChevronRight />
				</Button>
				{data && data.scope !== "none" && data.scope !== "self" ? (
					<Select value={employeeFilter} onValueChange={setEmployeeFilter}>
						<SelectTrigger className="h-9 w-56">
							<SelectValue placeholder="All employees" />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								<SelectItem value="all">All employees</SelectItem>
								{allRows.map((row) => (
									<SelectItem key={row.employeeId} value={row.employeeId}>
										{row.name} ({row.employeeNo})
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
				) : null}
				{data && data.scope !== "none" ? (
					<div className="ml-auto flex gap-2">
						<Button variant="outline" size="sm" onClick={downloadCsv} disabled={loading}>
							<FileSpreadsheet />
							Export CSV
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={downloadPdf}
							disabled={loading}
						>
							<Download />
							Download PDF
						</Button>
					</div>
				) : null}
			</div>
			{data?.scope === "none" ? (
				<Card>
					<CardHeader>
						<CardTitle>No report available</CardTitle>
						<CardDescription>
							Your account is not linked to an active employee record. Ask an
							admin to link you.
						</CardDescription>
					</CardHeader>
				</Card>
			) : (
				<>
					<Card>
						<CardHeader>
							<CardTitle>Monthly summary</CardTitle>
							<CardDescription>
								{selectedEmployee
									? `${selectedEmployee.name} (${selectedEmployee.employeeNo})`
									: data?.scope === "all"
										? "All active employees"
										: data?.scope === "subordinates"
											? "Your direct subordinates"
											: "Your own record"}
							</CardDescription>
						</CardHeader>
					<CardContent>
						<DataTable
							table={table}
							loading={loading}
							columnCount={leafCount}
							hidePagination
							stickyColumn
						/>
					</CardContent>
				</Card>
				{selectedEmployee ? (
					<Card>
						<CardHeader>
							<CardTitle>Daily register</CardTitle>
							<CardDescription>
								Every day of {monthLabel(cursor)} for {selectedEmployee.name}
							</CardDescription>
						</CardHeader>
						<CardContent className="overflow-x-auto">
							<table className="w-full min-w-160 text-sm">
								<thead>
									<tr className="border-b text-left text-xs text-muted-foreground">
										<th className="py-1.5 pr-3">Date</th>
										<th className="py-1.5 pr-3">Day</th>
										<th className="py-1.5 pr-3">Status</th>
										<th className="py-1.5 pr-3">In</th>
										<th className="py-1.5 pr-3">Out</th>
										<th className="py-1.5 pr-3">Hours</th>
										<th className="py-1.5">Note</th>
									</tr>
								</thead>
								<tbody>
									{(data?.dailyByEmployee[selectedEmployee.employeeId] ?? []).map(
										(day) => (
											<tr key={day.date} className="border-b last:border-0">
												<td className="py-1.5 pr-3 tabular-nums">{day.date}</td>
												<td className="py-1.5 pr-3">{day.weekday}</td>
												<td className="py-1.5 pr-3">
													<DailyStatusBadge status={day.status} />
												</td>
												<td className="py-1.5 pr-3 tabular-nums">
													{day.clockIn ?? "—"}
												</td>
												<td className="py-1.5 pr-3 tabular-nums">
													{day.clockOut ?? "—"}
												</td>
												<td className="py-1.5 pr-3 tabular-nums">
													{day.hours ?? "—"}
												</td>
												<td className="py-1.5 text-muted-foreground">
													{day.note ?? ""}
												</td>
											</tr>
										),
									)}
								</tbody>
							</table>
						</CardContent>
					</Card>
				) : null}
					{flatIssues.length > 0 ? (
						<Card>
							<CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
								<div className="space-y-1.5">
									<CardTitle>Attendance issues</CardTitle>
									<CardDescription>
										Flagged days and justification outcomes for{" "}
										{selectedEmployee ? selectedEmployee.name : monthLabel(cursor)}
									</CardDescription>
								</div>
								<div className="flex flex-wrap gap-2">
									<Select value={issueTypeFilter} onValueChange={setIssueTypeFilter}>
										<SelectTrigger className="h-9 w-40">
											<SelectValue placeholder="All types" />
										</SelectTrigger>
										<SelectContent>
											<SelectGroup>
												<SelectItem value="all">All types</SelectItem>
												{issueTypes.map((type) => (
													<SelectItem key={type} value={type}>
														{type.replace(/_/g, " ")}
													</SelectItem>
												))}
											</SelectGroup>
										</SelectContent>
									</Select>
									<Select value={issueStatusFilter} onValueChange={setIssueStatusFilter}>
										<SelectTrigger className="h-9 w-40">
											<SelectValue placeholder="All statuses" />
										</SelectTrigger>
										<SelectContent>
											<SelectGroup>
												<SelectItem value="all">All statuses</SelectItem>
												{["open", "pending", "verified", "rejected"].map((status) => (
													<SelectItem key={status} value={status}>
														{status}
													</SelectItem>
												))}
											</SelectGroup>
										</SelectContent>
									</Select>
								</div>
							</CardHeader>
							<CardContent className="overflow-x-auto">
								{visibleIssues.length === 0 ? (
									<p className="text-sm text-muted-foreground">
										No issues match the selected filters.
									</p>
								) : (
									<table className="w-full min-w-160 text-sm">
										<thead>
											<tr className="border-b text-left text-xs text-muted-foreground">
												<th className="py-1.5 pr-3">Employee</th>
												<th className="py-1.5 pr-3">Date</th>
												<th className="py-1.5 pr-3">Type</th>
												<th className="py-1.5 pr-3">Status</th>
												<th className="py-1.5 pr-3">Justification</th>
												<th className="py-1.5">Reviewer note</th>
											</tr>
										</thead>
										<tbody>
											{visibleIssues.map((issue, index) => (
												<tr
													key={`${issue.employeeNo}-${issue.date}-${issue.type}-${index}`}
													className="border-b last:border-0"
												>
													<td className="py-1.5 pr-3">
														{issue.employeeName}
														<span className="ml-2 text-xs text-muted-foreground">
															{issue.employeeNo}
														</span>
													</td>
													<td className="py-1.5 pr-3 tabular-nums">{issue.date}</td>
													<td className="py-1.5 pr-3">
														<Badge variant="secondary">
															{issue.type.replace(/_/g, " ")}
														</Badge>
													</td>
													<td className="py-1.5 pr-3">
														<Badge
															variant={
																issue.status === "verified"
																	? "outline"
																	: issue.status === "rejected"
																		? "destructive"
																		: issue.status === "pending"
																			? "secondary"
																			: "outline"
															}
														>
															{issue.status}
														</Badge>
													</td>
													<td className="max-w-72 truncate py-1.5 pr-3 text-muted-foreground">
														{issue.justification ? `“${issue.justification}”` : "—"}
													</td>
													<td className="max-w-60 truncate py-1.5 text-xs text-destructive">
														{issue.reviewNote ?? ""}
													</td>
												</tr>
											))}
										</tbody>
									</table>
								)}
							</CardContent>
						</Card>
					) : null}
				</>
			)}
		</div>
	);
}
