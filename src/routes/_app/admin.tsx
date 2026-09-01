import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
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

function AdminLayout() {
	return (
		<div className="flex flex-col gap-4">
			<Outlet />
		</div>
	);
}
