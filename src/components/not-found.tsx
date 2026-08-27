import { Link } from "@tanstack/react-router";

export function NotFound() {
	return (
		<main className="flex min-h-svh flex-col items-center justify-center gap-2 p-8 text-center">
			<p className="text-sm font-medium text-muted-foreground">404</p>
			<h1 className="text-4xl font-bold tracking-tight">Page not found</h1>
			<p className="text-balance text-muted-foreground">
				Sorry, we couldn&apos;t find the page you&apos;re looking for.
			</p>
			<Link
				to="/"
				className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
			>
				Back to home
			</Link>
		</main>
	);
}
