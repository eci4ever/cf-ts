import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	type ColumnDef,
	getCoreRowModel,
	getSortedRowModel,
	useReactTable,
} from "@tanstack/react-table";
import { Banknote, Eye } from "lucide-react";
import { useState } from "react";
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
import { Textarea } from "#/components/ui/textarea";
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
import {
	adminAdjustCredit,
	decideTopupRequest,
	listOrgBilling,
	listPendingTopupRequests,
} from "#/lib/billing.functions";
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
	memberCount: number;
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
	const queryClient = useQueryClient();
	const [topUpOrg, setTopUpOrg] = useState<OrgBillingRow | null>(null);
	const [ledgerOrg, setLedgerOrg] = useState<OrgBillingRow | null>(null);
	const [sorting, setSorting] = useState([{ id: "name", desc: false }]);
	const [search, setSearch] = useState("");
	const [statusFilter, setStatusFilter] = useState<string>("all");
	const orgsQuery = useQuery({
		queryKey: ["admin", "orgs"],
		queryFn: async () => {
			const rows = await listOrgBilling();
			return rows as OrgBillingRow[];
		},
	});
	const orgs = (orgsQuery.data ?? []).filter((org) => {
		if (
			search &&
			!org.name.toLowerCase().includes(search.toLowerCase())
		) {
			return false;
		}
		if (statusFilter !== "all" && org.status !== statusFilter) {
			return false;
		}
		return true;
	});
	const loading = orgsQuery.isPending;
	const adjustMutation = useMutation({
		mutationFn: async (input: {
			organizationId: string;
			amountSen: number;
			type: "topup" | "adjustment";
			note: string;
		}) => {
			const result = await adminAdjustCredit({ data: input });
			if (!result.ok) {
				throw new Error(result.reason);
			}
			return result;
		},
		onSuccess: (result) => {
			toast.success(`Balance updated to ${formatRm(result.balanceSen)}`);
			queryClient.invalidateQueries({ queryKey: ["admin", "orgs"] });
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});

	function handleTopUp(
		organizationId: string,
		amountSen: number,
		type: "topup" | "adjustment",
		note: string,
	) {
		adjustMutation.mutate({ organizationId, amountSen, type, note });
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
			accessorKey: "memberCount",
			header: ({ column }) => (
				<SortableHeader column={column} title="Members" />
			),
			cell: ({ row }) => row.original.memberCount,
		},
		{
			accessorKey: "paidUntil",
			header: "Paid until",
			cell: ({ row }) => {
				const paidUntil = row.original.paidUntil;
				if (!paidUntil) {
					return "—";
				}
				const days = Math.round(
					(new Date(paidUntil).getTime() - Date.now()) / 86_400_000,
				);
				const relative =
					days >= 0
						? `${days} day${days === 1 ? "" : "s"} left`
						: `expired ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`;
				return (
					<div>
						{new Date(paidUntil).toLocaleDateString()}
						<p
							className={`text-xs ${
								days < 0
									? "text-destructive"
									: days <= 7
										? "text-amber-600 dark:text-amber-400"
										: "text-muted-foreground"
							}`}
						>
							{relative}
						</p>
					</div>
				);
			},
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
		<div className="flex flex-col gap-4">
			<PendingTopupsCard />
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
					toolbar={
						<div className="flex items-center gap-2">
							<Input
								value={search}
								onChange={(event) => setSearch(event.target.value)}
								placeholder="Search organization…"
								className="h-9 w-56"
							/>
							<Select value={statusFilter} onValueChange={setStatusFilter}>
								<SelectTrigger className="h-9 w-36">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										<SelectItem value="all">All statuses</SelectItem>
										<SelectItem value="active">Active</SelectItem>
										<SelectItem value="warning">Warning</SelectItem>
										<SelectItem value="grace">Grace</SelectItem>
									</SelectGroup>
								</SelectContent>
							</Select>
						</div>
					}
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
		</div>
	);
}

type PendingTopupRow = {
	id: string;
	organizationId: string;
	orgName: string;
	amountSen: number;
	paymentRef: string;
	requestedByName: string;
	createdAt: Date | string;
};

function PendingTopupsCard() {
	const queryClient = useQueryClient();
	const [rejecting, setRejecting] = useState<PendingTopupRow | null>(null);
	const [rejectNote, setRejectNote] = useState("");
	const requestsQuery = useQuery({
		queryKey: ["admin", "topup-requests"],
		queryFn: listPendingTopupRequests,
	});
	const requests = (requestsQuery.data ?? []) as PendingTopupRow[];
	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: ["admin"] });

	const decideMutation = useMutation({
		mutationFn: async (input: {
			requestId: string;
			decision: "approved" | "rejected";
			note?: string;
		}) => {
			const result = await decideTopupRequest({ data: input });
			if (!result.ok) {
				throw new Error(result.reason);
			}
			return result;
		},
		onSuccess: (_result, variables) => {
			toast.success(`Request ${variables.decision}`);
			setRejecting(null);
			setRejectNote("");
			invalidate();
		},
		onError: (error) => toast.error(error.message),
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle>Top-up requests</CardTitle>
				<CardDescription>
					Approving adds the credit to the organization balance and records a
					ledger entry
				</CardDescription>
			</CardHeader>
			<CardContent>
				{requestsQuery.isPending ? (
					<p className="text-sm text-muted-foreground">Loading…</p>
				) : requests.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						No pending top-up requests.
					</p>
				) : (
					<ul className="flex flex-col gap-2">
						{requests.map((request) => (
							<li
								key={request.id}
								className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
							>
								<div className="min-w-0">
									<p className="font-medium">{request.orgName}</p>
									<p className="text-xs text-muted-foreground">
										{formatRm(request.amountSen)} · ref {request.paymentRef} ·{" "}
										{request.requestedByName} ·{" "}
										{new Date(request.createdAt).toLocaleDateString()}
									</p>
								</div>
								<div className="flex gap-1">
									<Button
										size="sm"
										variant="outline"
										disabled={decideMutation.isPending}
										onClick={() =>
											decideMutation.mutate({
												requestId: request.id,
												decision: "approved",
											})
										}
									>
										Approve
									</Button>
									<Button
										size="sm"
										variant="ghost"
										className="text-destructive"
										onClick={() => {
											setRejecting(request);
											setRejectNote("");
										}}
									>
										Reject
									</Button>
								</div>
							</li>
						))}
					</ul>
				)}
			</CardContent>
			<Dialog
				open={rejecting !== null}
				onOpenChange={(open) => {
					if (!open) {
						setRejecting(null);
					}
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Reject top-up request</DialogTitle>
						<DialogDescription>
							{rejecting
								? `${rejecting.orgName} — ${formatRm(rejecting.amountSen)} (ref ${rejecting.paymentRef})`
								: ""}
						</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-2">
						<Label htmlFor="reject-note">Reason (shown to the requester)</Label>
						<Textarea
							id="reject-note"
							value={rejectNote}
							onChange={(event) => setRejectNote(event.target.value)}
							placeholder="e.g. Payment reference not found in bank statement"
						/>
					</div>
					<DialogFooter>
						<Button
							variant="destructive"
							disabled={decideMutation.isPending}
							onClick={() => {
								if (rejecting) {
									decideMutation.mutate({
										requestId: rejecting.id,
										decision: "rejected",
										note: rejectNote,
									});
								}
							}}
						>
							{decideMutation.isPending ? "Rejecting…" : "Reject request"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
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
	) => void;
}) {
	const [amount, setAmount] = useState("");
	const [type, setType] = useState<"topup" | "adjustment">("topup");
	const [note, setNote] = useState("");

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
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
		onSubmit(org.id, amountSen, type, note);
		setAmount("");
		setNote("");
		onOpenChange(false);
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
						<Button type="submit">Confirm</Button>
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
	const ledgerQuery = useQuery({
		queryKey: ["admin", "ledger", org?.id],
		queryFn: async () => {
			if (!org) {
				return [] as LedgerRow[];
			}
			const rows = await listOrgLedger({ data: { organizationId: org.id } });
			return rows as LedgerRow[];
		},
		enabled: org !== null,
	});
	const ledger = (ledgerQuery.data ?? []) as LedgerRow[];
	const loading = ledgerQuery.isPending;

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
