import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { getPlatformStats } from "#/lib/admin.functions";
import { getSession } from "#/lib/auth.functions";

export const Route = createFileRoute("/_app/admin")({
	beforeLoad: async () => {
		const session = await getSession();
		if (!session) {
			throw redirect({ to: "/login" });
		}
		if (!session.user.role?.split(",").includes("admin")) {
			throw redirect({ to: "/dashboard" });
		}
	},
	component: AdminLayout,
});

type PlatformStats = {
	totalUsers: number;
	totalOrgs: number;
	activePaidOrgs: number;
	graceOrgs: number;
};

function AdminLayout() {
	const statsQuery = useQuery({
		queryKey: ["admin", "stats"],
		queryFn: getPlatformStats,
	});

	return (
		<div className="flex flex-col gap-4">
			{statsQuery.data ? <MetricsRow stats={statsQuery.data} /> : null}
			<Outlet />
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
