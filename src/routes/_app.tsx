import {
	createFileRoute,
	Outlet,
	redirect,
	useRouterState,
} from "@tanstack/react-router";
import { PageShell } from "#/components/page-shell";
import { getSession } from "#/lib/auth.functions";
import { getMyOrgRole } from "#/lib/org.functions";

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
		return {
			orgRole,
			isPlatformAdmin: session.user.role?.split(",").includes("admin") ?? false,
		};
	},
	component: AppLayout,
});

function AppLayout() {
	const matches = useRouterState({ select: (state) => state.matches });
	const lastMatch = matches[matches.length - 1];
	const title =
		(lastMatch?.staticData as { title?: string } | undefined)?.title ??
		"Dashboard";

	return (
		<PageShell title={title}>
			<Outlet />
		</PageShell>
	);
}
