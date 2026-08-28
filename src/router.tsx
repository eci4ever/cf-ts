import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { Button } from "#/components/ui/button";
import { getContext } from "./integrations/tanstack-query/root-provider";
import { routeTree } from "./routeTree.gen";

function AppErrorComponent() {
	return (
		<div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background p-6 text-center">
			<p className="text-lg font-semibold">Something went wrong</p>
			<p className="max-w-md text-sm text-muted-foreground">
				An unexpected error occurred while loading this page. Try again, or head
				back to the dashboard.
			</p>
			<div className="flex gap-2">
				<Button onClick={() => window.location.reload()}>Try again</Button>
				<Button variant="outline" asChild>
					<a href="/dashboard">Go to dashboard</a>
				</Button>
			</div>
		</div>
	);
}

export function getRouter() {
	const context = getContext();

	const router = createTanStackRouter({
		routeTree,
		context,
		scrollRestoration: true,
		defaultPreload: "intent",
		defaultPreloadStaleTime: 0,
		defaultErrorComponent: AppErrorComponent,
	});

	setupRouterSsrQueryIntegration({ router, queryClient: context.queryClient });

	return router;
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
