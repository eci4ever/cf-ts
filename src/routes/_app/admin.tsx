import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import {
	Banknote,
	MoreHorizontal,
	ShieldOff,
	UserCog,
	VenetianMask,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
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
import { Skeleton } from "#/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { getSession } from "#/lib/auth.functions";
import { authClient } from "#/lib/auth-client";
import { adminAdjustCredit, listOrgBilling } from "#/lib/billing.functions";
import {
	formatRm,
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
};

function AdminPage() {
	const router = useRouter();
	const [users, setUsers] = useState<UserRow[]>([]);
	const [loading, setLoading] = useState(true);

	const loadUsers = useCallback(async () => {
		setLoading(true);
		const { data, error: listError } = await authClient.admin.listUsers({
			query: { limit: 100, sortBy: "createdAt" },
		});
		if (listError) {
			toast.error(listError.message ?? "Failed to load users");
		} else {
			setUsers((data?.users ?? []) as UserRow[]);
		}
		setLoading(false);
	}, []);

	useEffect(() => {
		loadUsers();
	}, [loadUsers]);

	async function handleSetRole(userId: string, role: "user" | "admin") {
		await authClient.admin.setRole({ userId, role });
		await loadUsers();
	}

	async function handleBan(userId: string) {
		await authClient.admin.banUser({ userId });
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

	return (
		<div className="flex flex-col gap-4">
			<Card>
				<CardHeader>
					<CardTitle>User management</CardTitle>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Name</TableHead>
								<TableHead>Email</TableHead>
								<TableHead>Role</TableHead>
								<TableHead>Status</TableHead>
								<TableHead className="w-12" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{loading ? (
								["first", "second", "third"].map((row) => (
									<TableRow key={row}>
										<TableCell colSpan={5}>
											<Skeleton className="h-5 w-full" />
										</TableCell>
									</TableRow>
								))
							) : users.length === 0 ? (
								<TableRow>
									<TableCell
										colSpan={5}
										className="text-center text-muted-foreground"
									>
										No users found.
									</TableCell>
								</TableRow>
							) : (
								users.map((user) => (
									<TableRow key={user.id}>
										<TableCell className="font-medium">{user.name}</TableCell>
										<TableCell>{user.email}</TableCell>
										<TableCell>
											<Badge variant="secondary">
												{user.role?.split(",").includes("admin")
													? "admin"
													: "user"}
											</Badge>
										</TableCell>
										<TableCell>
											<Badge variant={user.banned ? "destructive" : "outline"}>
												{user.banned ? "Banned" : "Active"}
											</Badge>
										</TableCell>
										<TableCell>
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<Button
														variant="ghost"
														size="icon"
														aria-label="User actions"
													>
														<MoreHorizontal className="size-4" />
													</Button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align="end">
													<DropdownMenuLabel>Actions</DropdownMenuLabel>
													<DropdownMenuItem
														onClick={() => handleImpersonate(user.id)}
													>
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
														<DropdownMenuItem
															onClick={() => handleUnban(user.id)}
														>
															<ShieldOff />
															Unban
														</DropdownMenuItem>
													) : (
														<DropdownMenuItem
															onClick={() => handleBan(user.id)}
														>
															<ShieldOff />
															Ban
														</DropdownMenuItem>
													)}
												</DropdownMenuContent>
											</DropdownMenu>
										</TableCell>
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
				</CardContent>
			</Card>
			<OrgBillingSection />
		</div>
	);
}

type OrgBillingRow = {
	id: string;
	name: string;
	plan: PlanId;
	pendingPlan: PlanId | null;
	balanceSen: number;
	paidUntil: Date | null;
	status: SubscriptionStatus;
};

function OrgBillingSection() {
	const [orgs, setOrgs] = useState<OrgBillingRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [topUpOrg, setTopUpOrg] = useState<OrgBillingRow | null>(null);

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

	return (
		<Card>
			<CardHeader>
				<CardTitle>Organization billing</CardTitle>
				<CardDescription>
					Manual credit top ups and adjustments per organization
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Organization</TableHead>
							<TableHead>Plan</TableHead>
							<TableHead>Balance</TableHead>
							<TableHead>Paid until</TableHead>
							<TableHead>Status</TableHead>
							<TableHead className="w-12" />
						</TableRow>
					</TableHeader>
					<TableBody>
						{loading ? (
							<TableRow>
								<TableCell colSpan={6}>
									<Skeleton className="h-5 w-full" />
								</TableCell>
							</TableRow>
						) : orgs.length === 0 ? (
							<TableRow>
								<TableCell
									colSpan={6}
									className="text-center text-muted-foreground"
								>
									No organizations found.
								</TableCell>
							</TableRow>
						) : (
							orgs.map((org) => (
								<TableRow key={org.id}>
									<TableCell className="font-medium">{org.name}</TableCell>
									<TableCell>
										<Badge variant="secondary">{org.plan}</Badge>
										{org.pendingPlan && org.pendingPlan !== org.plan ? (
											<span className="ml-1 text-xs text-muted-foreground">
												→ {org.pendingPlan}
											</span>
										) : null}
									</TableCell>
									<TableCell>{formatRm(org.balanceSen)}</TableCell>
									<TableCell>
										{org.paidUntil
											? new Date(org.paidUntil).toLocaleDateString()
											: "—"}
									</TableCell>
									<TableCell>
										<Badge
											variant={
												org.status === "grace"
													? "destructive"
													: org.status === "warning"
														? "secondary"
														: "outline"
											}
										>
											{org.status}
										</Badge>
									</TableCell>
									<TableCell>
										<Button
											variant="ghost"
											size="icon"
											aria-label={`Top up ${org.name}`}
											onClick={() => setTopUpOrg(org)}
										>
											<Banknote />
										</Button>
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
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
