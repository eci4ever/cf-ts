import { createFileRoute, redirect } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, Download, Printer } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DataTable } from "#/components/data-table/data-table";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { getSession } from "#/lib/auth.functions";
import { getMonthlyReport } from "#/lib/reports.functions";

export const Route = createFileRoute("/_app/reports")({
	staticData: { title: "Reports" },
	beforeLoad: async () => {
		const session = await getSession();
		if (!session) {
			throw redirect({ to: "/login" });
		}
		if (!session.session.activeOrganizationId) {
			throw redirect({ to: "/onboarding" });
		}
	},
	component: ReportsPage,
});

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
	leaveDays: Record<string, number>;
	balanceRemaining: Record<string, number | null>;
};

type ReportData = {
	scope: "all" | "subordinates" | "self" | "none";
	month: number;
	year: number;
	balanceYear: string;
	orgName: string;
	leaveTypes: { id: string; name: string; quotaDays: number | null }[];
	rows: ReportRow[];
};

type Cursor = { year: number; month: number };

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
	const [data, setData] = useState<ReportData | null>(null);
	const [loading, setLoading] = useState(true);

	const load = useCallback(async () => {
		setLoading(true);
		const result = (await getMonthlyReport({
			data: { year: cursor.year, month: cursor.month },
		})) as ReportData;
		setData(result);
		setLoading(false);
	}, [cursor]);

	useEffect(() => {
		load();
	}, [load]);

	const rows = data?.rows ?? [];
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
		return [...base, takenGroup, balanceGroup];
	}, [data, cursor]);

	const leafCount = 7 + 2 * (data?.leaveTypes.length ?? 0);

	const table = useReactTable({
		data: rows,
		columns,
		getCoreRowModel: getCoreRowModel(),
	});

	const canExport = data?.scope === "all";

	function downloadCsv() {
		if (!data) {
			return;
		}
		const escapeCsvCell = (value: string | number | null) => {
			const text = String(value ?? "");
			return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
		};
		const headerCells = [
			"Employee No",
			"Name",
			"Work days",
			"Present",
			"Late",
			"Early out",
			"Missing out",
			"Absent",
			...data.leaveTypes.flatMap((type) => [
				`${type.name} (days)`,
				`${type.name} (balance)`,
			]),
		];
		const lines = [headerCells.map(escapeCsvCell).join(",")];
		for (const row of data.rows) {
			const cells = [
				row.employeeNo,
				row.name,
				row.workingDays,
				row.present,
				row.late,
				row.earlyOut,
				row.missingOut,
				row.absent,
				...data.leaveTypes.flatMap((type) => [
					row.leaveDays[type.id] ?? 0,
					row.balanceRemaining[type.id] ?? "",
				]),
			];
			lines.push(cells.map(escapeCsvCell).join(","));
		}
		const blob = new Blob([`\uFEFF${lines.join("\n")}`], {
			type: "text/csv;charset=utf-8",
		});
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = `report-${data.year}-${String(data.month).padStart(2, "0")}.csv`;
		anchor.click();
		URL.revokeObjectURL(url);
	}

	const now = new Date();
	const isCurrentMonth =
		cursor.year === now.getFullYear() && cursor.month === now.getMonth() + 1;

	return (
		<div className="flex flex-col gap-4">
			<style>{`
				.print-only { display: none; }
				@media print {
					.no-print { display: none !important; }
					.print-only { display: block; }
					body * { visibility: hidden; }
					.print-area, .print-area * { visibility: visible; }
					.print-area { position: absolute; inset: 0; }
				}
			`}</style>
			<div className="print-only">
				<h2 className="text-lg font-semibold">
					{data?.orgName ?? ""} — Monthly Attendance Report
				</h2>
				<p className="text-sm">
					{monthLabel(cursor)} · balance year {data?.balanceYear}
				</p>
			</div>
			<div className="no-print flex flex-wrap items-center gap-2">
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
				{canExport ? (
					<div className="ml-auto flex gap-2">
						<Button variant="outline" size="sm" onClick={downloadCsv}>
							<Download />
							CSV
						</Button>
						<Button variant="outline" size="sm" onClick={() => window.print()}>
							<Printer />
							Print / PDF
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
				<Card className="print-area">
					<CardHeader className="no-print">
						<CardTitle>Monthly summary</CardTitle>
						<CardDescription>
							{data?.scope === "all"
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
						/>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
