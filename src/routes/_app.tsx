import { useQueryClient } from "@tanstack/react-query";
import {
	createFileRoute,
	Outlet,
	redirect,
	useRouter,
	useRouterState,
} from "@tanstack/react-router";
import { VenetianMask } from "lucide-react";
import { PageShell } from "#/components/page-shell";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { getSession } from "#/lib/auth.functions";
import { authClient } from "#/lib/auth-client";
import { ensureSubscription } from "#/lib/billing.functions";
import { getMyOrgRole } from "#/lib/org.functions";
import { GRACE_MS, PLANS } from "#/lib/subscription";

export const Route = createFileRoute("/_app")({
	beforeLoad: async () => {
		const session = await getSession();
		if (!session) {
			throw redirect({ to: "/login" });
		}
		if (!session.session.activeOrganizationId) {
			throw redirect({ to: "/onboarding" });
		}
		const orgRole = await getMyOrgRole();
		const subscription = await ensureSubscription();
		return {
			orgRole,
			isPlatformAdmin: session.user.role?.split(",").includes("admin") ?? false,
			subscription,
		};
	},
	component: AppLayout,
});

function SubscriptionBanner() {
	const { subscription } = Route.useRouteContext();
	if (!subscription) {
		return null;
	}
	if (subscription.status === "grace") {
		return (
			<div className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-sm">
				<Badge variant="destructive">Payment overdue</Badge>
				<span>
					Your {PLANS[subscription.plan].name} subscription has expired. Top up
					and renew by{" "}
					{subscription.paidUntil
						? new Date(
								subscription.paidUntil.getTime() + GRACE_MS,
							).toLocaleDateString()
						: "—"}{" "}
					to keep {PLANS[subscription.plan].name} features.
				</span>
			</div>
		);
	}
	if (subscription.status === "warning") {
		return (
			<div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3 text-sm">
				<Badge variant="outline">Renewal due</Badge>
				<span>
					Balance is insufficient to renew {PLANS[subscription.plan].name} by{" "}
					{subscription.paidUntil?.toLocaleDateString() ?? "—"} — top up to
					avoid interruption.
				</span>
			</div>
		);
	}
	return null;
}

function ImpersonationBanner() {
	const router = useRouter();
	const queryClient = useQueryClient();
	const { data } = authClient.useSession();
	if (!data?.session.impersonatedBy) {
		return null;
	}
	return (
		<div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3 text-sm">
			<Badge variant="outline">
				<VenetianMask />
				Impersonating
			</Badge>
			<span>
				You are signed in as <strong>{data.user.name}</strong> (
				{data.user.email}) through admin impersonation.
			</span>
			<Button
				variant="outline"
				size="sm"
				className="ml-auto"
				onClick={async () => {
					await authClient.admin.stopImpersonating();
					queryClient.clear();
					await router.invalidate();
					await router.navigate({ to: "/admin/users" });
				}}
			>
				Stop impersonating
			</Button>
		</div>
	);
}

function AppLayout() {
	const matches = useRouterState({ select: (state) => state.matches });
	const lastMatch = matches[matches.length - 1];
	const title =
		(lastMatch?.staticData as { title?: string } | undefined)?.title ??
		"Dashboard";

	return (
		<PageShell title={title}>
			<ImpersonationBanner />
			<SubscriptionBanner />
			<Outlet />
		</PageShell>
	);
}
