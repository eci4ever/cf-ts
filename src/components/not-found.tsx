import { Link } from "@tanstack/react-router";
import { Button } from "#/components/ui/button";

export function NotFound() {
	return (
		<main className="flex min-h-svh flex-col items-center justify-center gap-2 p-8 text-center">
			<p className="text-sm font-medium text-muted-foreground">404</p>
			<h1 className="text-4xl font-bold tracking-tight">Page not found</h1>
			<p className="text-balance text-muted-foreground">
				Sorry, we couldn&apos;t find the page you&apos;re looking for.
			</p>
			<Button asChild className="mt-4">
				<Link to="/">Back to home</Link>
			</Button>
		</main>
	);
}
