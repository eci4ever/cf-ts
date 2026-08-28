import { createFileRoute, useRouter } from "@tanstack/react-router";
import {
	type ColumnDef,
	getCoreRowModel,
	useReactTable,
} from "@tanstack/react-table";
import { MoreHorizontal, ShieldOff, UserCog, VenetianMask } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
	DataTable,
	DataTableSearchInput,
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
import { authClient } from "#/lib/auth-client";

export const Route = createFileRoute("/_app/admin/users")({
	staticData: { title: "Users" },
	component: UsersAdminPage,
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

const BAN_DURATIONS = [
	{ label: "1 day", days: 1 },
	{ label: "7 days", days: 7 },
	{ label: "30 days", days: 30 },
	{ label: "Permanent", days: 0 },
] as const;

function UsersAdminPage() {
	const router = useRouter();
	const [users, setUsers] = useState<UserRow[]>([]);
	const [total, setTotal] = useState(0);
	const [loading, setLoading] = useState(true);
	const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });
	const [searchInput, setSearchInput] = useState("");
	const [search, setSearch] = useState("");
	const [banTarget, setBanTarget] = useState<UserRow | null>(null);

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

	const columns: ColumnDef<UserRow>[] = [
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

	const table = useReactTable({
		data: users,
		columns,
		getCoreRowModel: getCoreRowModel(),
		manualPagination: true,
		manualFiltering: true,
		pageCount: Math.max(1, Math.ceil(total / pagination.pageSize)),
		state: { pagination },
		onPaginationChange: setPagination,
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle>User management</CardTitle>
				<CardDescription>
					Search by email, manage roles, bans and impersonation
				</CardDescription>
			</CardHeader>
			<CardContent>
				<DataTable
					table={table}
					loading={loading}
					columnCount={columns.length}
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
			<BanDialog
				user={banTarget}
				onOpenChange={(open) => {
					if (!open) {
						setBanTarget(null);
					}
				}}
				onConfirm={handleBanConfirm}
			/>
		</Card>
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
