import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import {
	type ColumnDef,
	getCoreRowModel,
	getSortedRowModel,
	useReactTable,
} from "@tanstack/react-table";
import {
	Banknote,
	Eye,
	MoreHorizontal,
	ShieldOff,
	UserCog,
	VenetianMask,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
	DataTable,
	DataTableSearchInput,
	SortableHeader,
} from "#/components/data-table/data-table";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "#/components/ui/alert-dialog";
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
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
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
import { getPlatformStats, listOrgLedger } from "#/lib/admin.functions";
import { getSession } from "#/lib/auth.functions";
import { authClient } from "#/lib/auth-client";
import { adminAdjustCredit, listOrgBilling } from "#/lib/billing.functions";
import {
	formatRm,
	type LedgerType,
	type PlanId,
	parseRmToSen,
	type SubscriptionStatus,
} from "#/lib/subscription";

export const Route = createFileRoute("/_app/admin")({
	staticData: { title: "Admin" },
	beforeLoad: async () => {
		const session = await getSession();
		if (!session) {
			throw redirect({ to: "/login" });
		}
		if (!session.user.role?.split(",").includes("admin")) {
			throw redirect({ to: "/dashboard" });
		}
	},
	component: AdminPage,
});

type UserRow = {
	id: string;
	name: string;
	email: string;
	role?: string | null;
	banned?: boolean | null;
	banReason?: string | null;
	banExpires?: Date | null;
};

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

const BAN_DURATIONS = [
	{ label: "1 day", days: 1 },
	{ label: "7 days", days: 7 },
	{ label: "30 days", days: 30 },
	{ label: "Permanent", days: 0 },
] as const;

function AdminPage() {
	const router = useRouter();
	const [stats, setStats] = useState<{
		totalUsers: number;
		totalOrgs: number;
		activePaidOrgs: number;
		graceOrgs: number;
	} | null>(null);

	const [users, setUsers] = useState<UserRow[]>([]);
	const [total, setTotal] = useState(0);
	const [loading, setLoading] = useState(true);
	const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });
	const [searchInput, setSearchInput] = useState("");
	const [search, setSearch] = useState("");
	const [banTarget, setBanTarget] = useState<UserRow | null>(null);

	useEffect(() => {
		getPlatformStats()
			.then(setStats)
			.catch(() => toast.error("Failed to load platform stats"));
	}, []);

	useEffect(() => {
		const timer = setTimeout(() => {
			setSearch(searchInput);
			setPagination((previous) => ({ ...previous, pageIndex: 0 }));
		}, 300);
		return () => clearTimeout(timer);
	}, [searchInput]);

	const loadUsers = useCallback(async () => {
		setLoading(true);
		const { data, error: listError } = await authClient.admin.listUsers({
			query: {
				limit: pagination.pageSize,
				offset: pagination.pageIndex * pagination.pageSize,
				searchValue: search || undefined,
				searchField: "email",
				searchOperator: "contains",
				sortBy: "createdAt",
				sortDirection: "desc",
			},
		});
		if (listError) {
			toast.error(listError.message ?? "Failed to load users");
		} else {
			setUsers((data?.users ?? []) as UserRow[]);
			setTotal(data?.total ?? 0);
		}
		setLoading(false);
	}, [pagination.pageSize, pagination.pageIndex, search]);

	useEffect(() => {
		loadUsers();
	}, [loadUsers]);

	async function handleSetRole(userId: string, role: "user" | "admin") {
		await authClient.admin.setRole({ userId, role });
		await loadUsers();
	}

	async function handleUnban(userId: string) {
		await authClient.admin.unbanUser({ userId });
		await loadUsers();
	}

	async function handleImpersonate(userId: string) {
		const { error } = await authClient.admin.impersonateUser({ userId });
		if (error) {
			toast.error(error.message ?? "Failed to impersonate user");
			return;
		}
		await router.invalidate();
		await router.navigate({ to: "/dashboard" });
	}

	async function handleBanConfirm(reason: string, days: number) {
		if (!banTarget) {
			return;
		}
		const { error } = await authClient.admin.banUser({
			userId: banTarget.id,
			banReason: reason,
			...(days > 0 ? { banExpiresIn: days * 24 * 60 * 60 } : {}),
		});
		if (error) {
			toast.error(error.message ?? "Failed to ban user");
			return;
		}
		toast.success(`${banTarget.email} banned`);
		setBanTarget(null);
		await loadUsers();
	}

	const userColumns: ColumnDef<UserRow>[] = [
		{ accessorKey: "name", header: "Name" },
		{ accessorKey: "email", header: "Email" },
		{
			accessorKey: "role",
			header: "Role",
			cell: ({ row }) => (
				<Badge variant="secondary">
					{row.original.role?.split(",").includes("admin") ? "admin" : "user"}
				</Badge>
			),
		},
		{
			accessorKey: "banned",
			header: "Status",
			cell: ({ row }) =>
				row.original.banned ? (
					<div>
						<Badge variant="destructive">Banned</Badge>
						{row.original.banReason ? (
							<p className="mt-1 text-xs text-muted-foreground">
								{row.original.banReason}
								{row.original.banExpires
									? ` · until ${new Date(row.original.banExpires).toLocaleDateString()}`
									: ""}
							</p>
						) : null}
					</div>
				) : (
					<Badge variant="outline">Active</Badge>
				),
		},
		{
			id: "actions",
			header: "",
			cell: ({ row }) => {
				const user = row.original;
				return (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" size="icon" aria-label="User actions">
								<MoreHorizontal />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuLabel>Actions</DropdownMenuLabel>
							<DropdownMenuItem onClick={() => handleImpersonate(user.id)}>
								<VenetianMask />
								Impersonate
							</DropdownMenuItem>
							{user.role?.split(",").includes("admin") ? (
								<DropdownMenuItem
									onClick={() => handleSetRole(user.id, "user")}
								>
									<UserCog />
									Make user
								</DropdownMenuItem>
							) : (
								<DropdownMenuItem
									onClick={() => handleSetRole(user.id, "admin")}
								>
									<UserCog />
									Make admin
								</DropdownMenuItem>
							)}
							{user.banned ? (
								<DropdownMenuItem onClick={() => handleUnban(user.id)}>
									<ShieldOff />
									Unban
								</DropdownMenuItem>
							) : (
								<DropdownMenuItem onClick={() => setBanTarget(user)}>
									<ShieldOff />
									Ban
								</DropdownMenuItem>
							)}
						</DropdownMenuContent>
					</DropdownMenu>
				);
			},
		},
	];

	const userTable = useReactTable({
		data: users,
		columns: userColumns,
		getCoreRowModel: getCoreRowModel(),
		manualPagination: true,
		manualFiltering: true,
		pageCount: Math.max(1, Math.ceil(total / pagination.pageSize)),
		state: { pagination },
		onPaginationChange: setPagination,
	});

	return (
		<div className="flex flex-col gap-4">
			{stats ? <MetricsRow stats={stats} /> : null}
			<Card>
				<CardHeader>
					<CardTitle>User management</CardTitle>
					<CardDescription>
						Search by email, manage roles, bans and impersonation
					</CardDescription>
				</CardHeader>
				<CardContent>
					<DataTable
						table={userTable}
						loading={loading}
						columnCount={userColumns.length}
						totalRows={total}
						toolbar={
							<DataTableSearchInput
								value={searchInput}
								onChange={setSearchInput}
								placeholder="Search by email…"
							/>
						}
					/>
				</CardContent>
			</Card>
			<OrgBillingSection />
			<BanDialog
				user={banTarget}
				onOpenChange={(open) => {
					if (!open) {
						setBanTarget(null);
					}
				}}
				onConfirm={handleBanConfirm}
			/>
		</div>
	);
}

function MetricsRow({
	stats,
}: {
	stats: {
		totalUsers: number;
		totalOrgs: number;
		activePaidOrgs: number;
		graceOrgs: number;
	};
}) {
	const items = [
		{ label: "Total users", value: stats.totalUsers },
		{ label: "Organizations", value: stats.totalOrgs },
		{ label: "Active paid orgs", value: stats.activePaidOrgs },
		{ label: "Orgs in grace period", value: stats.graceOrgs },
	];
	return (
		<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
			{items.map((item) => (
				<Card key={item.label}>
					<CardHeader className="flex-row items-center justify-between space-y-0">
						<CardDescription>{item.label}</CardDescription>
					</CardHeader>
					<CardContent>
						<CardTitle className="text-2xl">{item.value}</CardTitle>
					</CardContent>
				</Card>
			))}
		</div>
	);
}

function BanDialog({
	user,
	onOpenChange,
	onConfirm,
}: {
	user: UserRow | null;
	onOpenChange: (open: boolean) => void;
	onConfirm: (reason: string, days: number) => Promise<void>;
}) {
	const [reason, setReason] = useState("");
	const [durationLabel, setDurationLabel] = useState<string>("7 days");
	const [pending, setPending] = useState(false);

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!reason.trim()) {
			toast.error("Ban reason is required");
			return;
		}
		setPending(true);
		const days =
			BAN_DURATIONS.find((duration) => duration.label === durationLabel)
				?.days ?? 7;
		await onConfirm(reason.trim(), days);
		setPending(false);
		setReason("");
		setDurationLabel("7 days");
	}

	return (
		<AlertDialog
			open={user !== null}
			onOpenChange={(open) => {
				if (!open) {
					setReason("");
				}
				onOpenChange(open);
			}}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Ban {user?.email}?</AlertDialogTitle>
					<AlertDialogDescription>
						The user will be signed out immediately and cannot sign in until the
						ban expires or is lifted.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<form onSubmit={handleSubmit} className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<Label htmlFor="ban-reason">Reason</Label>
						<Input
							id="ban-reason"
							placeholder="e.g. Abusive behaviour"
							value={reason}
							onChange={(event) => setReason(event.target.value)}
							required
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="ban-duration">Duration</Label>
						<Select value={durationLabel} onValueChange={setDurationLabel}>
							<SelectTrigger id="ban-duration" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									{BAN_DURATIONS.map((duration) => (
										<SelectItem key={duration.label} value={duration.label}>
											{duration.label}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
					</div>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction asChild>
							<Button type="submit" variant="destructive" disabled={pending}>
								{pending ? "Banning..." : "Ban user"}
							</Button>
						</AlertDialogAction>
					</AlertDialogFooter>
				</form>
			</AlertDialogContent>
		</AlertDialog>
	);
}

function OrgBillingSection() {
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

	const orgColumns: ColumnDef<OrgBillingRow>[] = [
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

	const orgTable = useReactTable({
		data: orgs,
		columns: orgColumns,
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
					table={orgTable}
					loading={loading}
					columnCount={orgColumns.length}
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

	const ledgerColumns: ColumnDef<LedgerRow>[] = [
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

	const ledgerTable = useReactTable({
		data: ledger,
		columns: ledgerColumns,
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
						table={ledgerTable}
						loading={loading}
						columnCount={ledgerColumns.length}
						hidePagination
					/>
				</div>
			</SheetContent>
		</Sheet>
	);
}
