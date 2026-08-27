import {
	createFileRoute,
	Link,
	redirect,
	useRouter,
} from "@tanstack/react-router";
import { useState } from "react";
import { CalendarCheck } from "lucide-react";
import { authClient } from "#/lib/auth-client";
import { getSession } from "#/lib/auth.functions";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";

export const Route = createFileRoute("/login")({
	beforeLoad: async () => {
		const session = await getSession();
		if (session) {
			throw redirect({ to: "/" });
		}
	},
	component: LoginPage,
});

function LoginPage() {
	const router = useRouter();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		setPending(true);

		const { error: signInError } = await authClient.signIn.email({
			email,
			password,
		});

		setPending(false);

		if (signInError) {
			setError(signInError.message ?? "Something went wrong");
			return;
		}

		await router.invalidate();
		await router.navigate({ to: "/" });
	}

	return (
		<main className="flex min-h-svh items-center justify-center bg-background p-6">
			<Card className="w-full max-w-sm">
				<CardHeader className="text-center">
					<Link
						to="/"
						aria-label="Back to home"
						className="mx-auto mb-2 flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90"
					>
						<CalendarCheck className="size-5" />
					</Link>
					<CardTitle className="text-xl">Welcome back</CardTitle>
					<CardDescription>
						Sign in to your Attendance Management System account
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSubmit} className="flex flex-col gap-4">
						<div className="flex flex-col gap-2">
							<Label htmlFor="email">Email</Label>
							<Input
								id="email"
								type="email"
								placeholder="you@company.com"
								value={email}
								onChange={(event) => setEmail(event.target.value)}
								required
							/>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="password">Password</Label>
							<Input
								id="password"
								type="password"
								value={password}
								onChange={(event) => setPassword(event.target.value)}
								required
							/>
						</div>
						{error ? (
							<p className="text-sm text-destructive">{error}</p>
						) : null}
						<Button type="submit" disabled={pending}>
							{pending ? "Signing in..." : "Sign in"}
						</Button>
						<p className="text-center text-sm text-muted-foreground">
							Don&apos;t have an account?{" "}
							<a href="/signup" className="text-primary hover:underline">
								Sign up
							</a>
						</p>
					</form>
				</CardContent>
			</Card>
		</main>
	);
}
