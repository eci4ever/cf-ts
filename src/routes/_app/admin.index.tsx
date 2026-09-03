import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
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
import { authClient } from "#/lib/auth-client";
import { getPlatformStats, runCronNow } from "#/lib/admin.functions";
import { listOrgBilling } from "#/lib/billing.functions";

export const Route = createFileRoute("/_app/admin/")({
	staticData: { title: "Platform admin" },
	component: AdminOverviewPage,
});

type PlatformStats = {
	totalUsers: number;
	totalOrgs: number;
	activePaidOrgs: number;
	graceOrgs: number;
};

type RecentUser = {
	id: string;
	name: string;
	email: string;
	createdAt: Date | string;
};

type OrgBillingRow = {
	id: string;
	name: string;
	plan: string;
	status: string;
	memberCount: number;
	paidUntil: Date | string | null;
};

function AdminOverviewPage() {
	const statsQuery = useQuery({
		queryKey: ["admin", "stats"],
		queryFn: getPlatformStats,
	});
	const recentQuery = useQuery({
		queryKey: ["admin", "recent-users"],
		queryFn: async () => {
			const { data, error } = await authClient.admin.listUsers({
				query: {
					limit: 8,
					sortBy: "createdAt",
					sortDirection: "desc",
				},
			});
			if (error) {
				throw new Error(error.message ?? "Failed to load recent users");
			}
			return (data?.users ?? []) as RecentUser[];
		},
	});
	const orgsQuery = useQuery({
		queryKey: ["admin", "orgs"],
		queryFn: async () => (await listOrgBilling()) as OrgBillingRow[],
	});
	const attentionOrgs = (orgsQuery.data ?? []).filter(
		(org) => org.status === "warning" || org.status === "grace",
	);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between gap-2">
				<h1 className="text-lg font-semibold">Platform overview</h1>
				<CronButton />
			</div>
			{statsQuery.data ? <MetricsRow stats={statsQuery.data} /> : null}
			<div className="grid gap-4 lg:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Recent signups</CardTitle>
						<CardDescription>Newest accounts on the platform</CardDescription>
					</CardHeader>
					<CardContent>
						{recentQuery.isPending ? (
							<p className="text-sm text-muted-foreground">Loading…</p>
						) : (recentQuery.data ?? []).length === 0 ? (
							<p className="text-sm text-muted-foreground">No users yet.</p>
						) : (
							<ul className="flex flex-col gap-2">
								{(recentQuery.data ?? []).map((user) => (
									<li
										key={user.id}
										className="flex items-center justify-between gap-2 text-sm"
									>
										<span className="min-w-0 truncate">
											<span className="font-medium">{user.name}</span>
											<span className="ml-2 text-muted-foreground">
												{user.email}
											</span>
										</span>
										<span className="shrink-0 text-xs text-muted-foreground">
											{new Date(user.createdAt).toLocaleDateString()}
										</span>
									</li>
								))}
							</ul>
						)}
						<Button asChild variant="link" className="mt-2 h-fit px-0">
							<Link to="/admin/users">Manage users →</Link>
						</Button>
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle>Needs attention</CardTitle>
						<CardDescription>
							Organizations in warning or grace period
						</CardDescription>
					</CardHeader>
					<CardContent>
						{orgsQuery.isPending ? (
							<p className="text-sm text-muted-foreground">Loading…</p>
						) : attentionOrgs.length === 0 ? (
							<p className="text-sm text-muted-foreground">
								All organizations are in good standing.
							</p>
						) : (
							<ul className="flex flex-col gap-2">
								{attentionOrgs.map((org) => (
									<li
										key={org.id}
										className="flex items-center justify-between gap-2 text-sm"
									>
										<span className="min-w-0 truncate">
											<Link
												to="/admin/organizations/$orgId"
												params={{ orgId: org.id }}
												className="font-medium hover:underline"
											>
												{org.name}
											</Link>
											<span className="ml-2 text-xs text-muted-foreground">
												{org.memberCount} member
												{org.memberCount === 1 ? "" : "s"}
											</span>
										</span>
										<Badge
											variant={org.status === "grace" ? "destructive" : "secondary"}
										>
											{org.status}
										</Badge>
									</li>
								))}
							</ul>
						)}
						<Button asChild variant="link" className="mt-2 h-fit px-0">
							<Link to="/admin/organizations">Billing overview →</Link>
						</Button>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

function CronButton() {
	const [result, setResult] = useState<string | null>(null);
	const cronMutation = useMutation({
		mutationFn: runCronNow,
		onSuccess: (result) => {
			setResult(
				`swept ${result.sweepOrgs} org(s) · ${result.clockIn} clock-in · ${result.clockOut} clock-out`,
			);
			toast.success("Cron run completed");
		},
		onError: (error) => toast.error(error.message),
	});
	return (
		<div className="flex items-center gap-2">
			{result ? (
				<span className="text-xs text-muted-foreground">{result}</span>
			) : null}
			<Button
				variant="outline"
				size="sm"
				disabled={cronMutation.isPending}
				onClick={() => cronMutation.mutate()}
			>
				{cronMutation.isPending ? "Running…" : "Run cron now"}
			</Button>
		</div>
	);
}

function MetricsRow({ stats }: { stats: PlatformStats }) {
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
