import {
	createFileRoute,
	Outlet,
	redirect,
	useRouterState,
} from "@tanstack/react-router";
import { PageShell } from "#/components/page-shell";
import { getSession } from "#/lib/auth.functions";

export const Route = createFileRoute("/_app")({
	beforeLoad: async () => {
		const session = await getSession();
		if (!session) {
			throw redirect({ to: "/login" });
		}
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
