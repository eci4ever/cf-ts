import { createFileRoute } from "@tanstack/react-router";
import {
	type ColumnDef,
	getCoreRowModel,
	getSortedRowModel,
	useReactTable,
} from "@tanstack/react-table";
import { Banknote, Eye } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { DataTable, SortableHeader } from "#/components/data-table/data-table";
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
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "#/components/ui/sheet";
import { listOrgLedger } from "#/lib/admin.functions";
import { adminAdjustCredit, listOrgBilling } from "#/lib/billing.functions";
import {
	formatRm,
	type LedgerType,
	type PlanId,
	parseRmToSen,
	type SubscriptionStatus,
} from "#/lib/subscription";

export const Route = createFileRoute("/_app/admin/organizations")({
	staticData: { title: "Organization" },
	component: OrganizationsAdminPage,
});

type OrgBillingRow = {
	id: string;
	name: string;
	plan: PlanId;
	pendingPlan: PlanId | null;
	balanceSen: number;
	paidUntil: Date | null;
	status: SubscriptionStatus;
};

type LedgerRow = {
	id: string;
	type: LedgerType;
	amountSen: number;
	balanceAfterSen: number;
	note: string | null;
	createdAt: Date;
	createdByName: string | null;
};

function OrganizationsAdminPage() {
	const [orgs, setOrgs] = useState<OrgBillingRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [topUpOrg, setTopUpOrg] = useState<OrgBillingRow | null>(null);
	const [ledgerOrg, setLedgerOrg] = useState<OrgBillingRow | null>(null);
	const [sorting, setSorting] = useState([{ id: "name", desc: false }]);

	const loadOrgs = useCallback(async () => {
		setLoading(true);
		try {
			const rows = await listOrgBilling();
			setOrgs(rows as OrgBillingRow[]);
		} catch {
			toast.error("Failed to load organization billing");
		}
		setLoading(false);
	}, []);

	useEffect(() => {
		loadOrgs();
	}, [loadOrgs]);

	async function handleTopUp(
		organizationId: string,
		amountSen: number,
		type: "topup" | "adjustment",
		note: string,
	) {
		const result = await adminAdjustCredit({
			data: { organizationId, amountSen, type, note },
		});
		if (!result.ok) {
			toast.error(result.reason);
			return false;
		}
		toast.success(`Balance updated to ${formatRm(result.balanceSen)}`);
		await loadOrgs();
		return true;
	}

	const columns: ColumnDef<OrgBillingRow>[] = [
		{
			accessorKey: "name",
			header: ({ column }) => (
				<SortableHeader column={column} title="Organization" />
			),
		},
		{
			accessorKey: "plan",
			header: "Plan",
			cell: ({ row }) => (
				<div>
					<Badge variant="secondary">{row.original.plan}</Badge>
					{row.original.pendingPlan &&
					row.original.pendingPlan !== row.original.plan ? (
						<span className="ml-1 text-xs text-muted-foreground">
							→ {row.original.pendingPlan}
						</span>
					) : null}
				</div>
			),
		},
		{
			accessorKey: "balanceSen",
			header: ({ column }) => (
				<SortableHeader column={column} title="Balance" />
			),
			cell: ({ row }) => formatRm(row.original.balanceSen),
		},
		{
			accessorKey: "paidUntil",
			header: "Paid until",
			cell: ({ row }) =>
				row.original.paidUntil
					? new Date(row.original.paidUntil).toLocaleDateString()
					: "—",
		},
		{
			accessorKey: "status",
			header: "Status",
			cell: ({ row }) => (
				<Badge
					variant={
						row.original.status === "grace"
							? "destructive"
							: row.original.status === "warning"
								? "secondary"
								: "outline"
					}
				>
					{row.original.status}
				</Badge>
			),
		},
		{
			id: "actions",
			header: "",
			cell: ({ row }) => (
				<div className="flex items-center gap-1">
					<Button
						variant="ghost"
						size="icon"
						aria-label={`View ledger for ${row.original.name}`}
						onClick={() => setLedgerOrg(row.original)}
					>
						<Eye />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						aria-label={`Top up ${row.original.name}`}
						onClick={() => setTopUpOrg(row.original)}
					>
						<Banknote />
					</Button>
				</div>
			),
		},
	];

	const table = useReactTable({
		data: orgs,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		onSortingChange: setSorting,
		state: { sorting },
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle>Organization billing</CardTitle>
				<CardDescription>
					Manual credit top ups and adjustments per organization
				</CardDescription>
			</CardHeader>
			<CardContent>
				<DataTable
					table={table}
					loading={loading}
					columnCount={columns.length}
					stickyColumn
				/>
			</CardContent>
			<OrgTopUpDialog
				org={topUpOrg}
				onOpenChange={(open) => {
					if (!open) {
						setTopUpOrg(null);
					}
				}}
				onSubmit={handleTopUp}
			/>
			<LedgerSheet
				org={ledgerOrg}
				onOpenChange={(open) => {
					if (!open) {
						setLedgerOrg(null);
					}
				}}
			/>
		</Card>
	);
}

function OrgTopUpDialog({
	org,
	onOpenChange,
	onSubmit,
}: {
	org: OrgBillingRow | null;
	onOpenChange: (open: boolean) => void;
	onSubmit: (
		organizationId: string,
		amountSen: number,
		type: "topup" | "adjustment",
		note: string,
	) => Promise<boolean>;
}) {
	const [amount, setAmount] = useState("");
	const [type, setType] = useState<"topup" | "adjustment">("topup");
	const [note, setNote] = useState("");
	const [pending, setPending] = useState(false);

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!org) {
			return;
		}
		const amountSen = parseRmToSen(amount);
		if (amountSen === null || amountSen === 0) {
			toast.error("Enter a valid amount, e.g. 29.00");
			return;
		}
		if (type === "topup" && amountSen < 0) {
			toast.error("Top up amount must be positive — use adjustment to deduct");
			return;
		}
		setPending(true);
		const ok = await onSubmit(org.id, amountSen, type, note);
		setPending(false);
		if (ok) {
			setAmount("");
			setNote("");
			onOpenChange(false);
		}
	}

	return (
		<Dialog
			open={org !== null}
			onOpenChange={(open) => {
				if (!open) {
					setType("topup");
				}
				onOpenChange(open);
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Top up credits — {org?.name}</DialogTitle>
					<DialogDescription>
						Current balance: {org ? formatRm(org.balanceSen) : "—"}
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={handleSubmit} className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<Label htmlFor="topup-amount">Amount (RM)</Label>
						<Input
							id="topup-amount"
							placeholder="29.00"
							value={amount}
							onChange={(event) => setAmount(event.target.value)}
							required
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="topup-type">Type</Label>
						<Select
							value={type}
							onValueChange={(value) =>
								setType(value as "topup" | "adjustment")
							}
						>
							<SelectTrigger id="topup-type" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									<SelectItem value="topup">Top up (add credits)</SelectItem>
									<SelectItem value="adjustment">
										Adjustment (positive or negative)
									</SelectItem>
								</SelectGroup>
							</SelectContent>
						</Select>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="topup-note">Note</Label>
						<Input
							id="topup-note"
							placeholder="Bank transfer #12345"
							value={note}
							onChange={(event) => setNote(event.target.value)}
						/>
					</div>
					<DialogFooter>
						<Button type="submit" disabled={pending}>
							{pending ? "Saving..." : "Confirm"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function LedgerSheet({
	org,
	onOpenChange,
}: {
	org: OrgBillingRow | null;
	onOpenChange: (open: boolean) => void;
}) {
	const [ledger, setLedger] = useState<LedgerRow[]>([]);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (!org) {
			return;
		}
		setLoading(true);
		listOrgLedger({ data: { organizationId: org.id } })
			.then((rows) => setLedger(rows as LedgerRow[]))
			.catch(() => toast.error("Failed to load ledger"))
			.finally(() => setLoading(false));
	}, [org]);

	const columns: ColumnDef<LedgerRow>[] = [
		{
			accessorKey: "createdAt",
			header: "Date",
			cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString(),
		},
		{
			accessorKey: "type",
			header: "Type",
			cell: ({ row }) => (
				<Badge variant="outline">{row.original.type.replace(/_/g, " ")}</Badge>
			),
		},
		{
			accessorKey: "amountSen",
			header: "Amount",
			cell: ({ row }) => (
				<span
					className={
						row.original.amountSen > 0
							? "font-medium"
							: "font-medium text-destructive"
					}
				>
					{row.original.amountSen > 0 ? "+" : "−"}
					{formatRm(Math.abs(row.original.amountSen))}
				</span>
			),
		},
		{
			accessorKey: "balanceAfterSen",
			header: "Balance after",
			cell: ({ row }) => formatRm(row.original.balanceAfterSen),
		},
		{
			accessorKey: "createdByName",
			header: "By",
			cell: ({ row }) => row.original.createdByName ?? "—",
		},
		{
			accessorKey: "note",
			header: "Note",
			cell: ({ row }) => (
				<span className="block max-w-48 truncate text-muted-foreground">
					{row.original.note ?? "—"}
				</span>
			),
		},
	];

	const table = useReactTable({
		data: ledger,
		columns,
		getCoreRowModel: getCoreRowModel(),
	});

	return (
		<Sheet open={org !== null} onOpenChange={onOpenChange}>
			<SheetContent className="sm:max-w-xl">
				<SheetHeader>
					<SheetTitle>Ledger — {org?.name}</SheetTitle>
					<SheetDescription>
						Last 50 credit transactions for this organization
					</SheetDescription>
				</SheetHeader>
				<div className="px-4 pb-6">
					<DataTable
						table={table}
						loading={loading}
						columnCount={columns.length}
						hidePagination
						stickyColumn
					/>
				</div>
			</SheetContent>
		</Sheet>
	);
}
