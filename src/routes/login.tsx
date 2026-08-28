import {
	createFileRoute,
	Link,
	redirect,
	useRouter,
} from "@tanstack/react-router";
import { CalendarCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
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
import { getSession } from "#/lib/auth.functions";
import { authClient } from "#/lib/auth-client";

export const Route = createFileRoute("/login")({
	beforeLoad: async () => {
		const session = await getSession();
		if (session) {
			throw redirect({ to: "/dashboard" });
		}
	},
	component: LoginPage,
});

function LoginPage() {
	const router = useRouter();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [twoFactorRequired, setTwoFactorRequired] = useState(false);
	const [useBackupCode, setUseBackupCode] = useState(false);
	const [code, setCode] = useState("");
	const [pending, setPending] = useState(false);

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setPending(true);

		const { data, error: signInError } = await authClient.signIn.email({
			email,
			password,
		});

		setPending(false);

		if (signInError) {
			toast.error(signInError.message ?? "Something went wrong");
			return;
		}

		if ((data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) {
			setTwoFactorRequired(true);
			return;
		}

		await router.invalidate();
		await router.navigate({ to: "/dashboard" });
	}

	async function handleVerify(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setPending(true);

		const { error: verifyError } = useBackupCode
			? await authClient.twoFactor.verifyBackupCode({ code })
			: await authClient.twoFactor.verifyTotp({ code });

		setPending(false);

		if (verifyError) {
			toast.error(verifyError.message ?? "Invalid code");
			return;
		}

		await router.invalidate();
		await router.navigate({ to: "/dashboard" });
	}

	if (twoFactorRequired) {
		return (
			<main className="flex min-h-svh items-center justify-center bg-background p-6">
				<Card className="w-full max-w-sm">
					<CardHeader className="text-center">
						<CardTitle className="text-xl">Two-factor authentication</CardTitle>
						<CardDescription>
							Enter the 6-digit code from your authenticator app
						</CardDescription>
					</CardHeader>
					<CardContent>
						<form onSubmit={handleVerify} className="flex flex-col gap-4">
							<div className="flex flex-col gap-2">
								<Label htmlFor="two-factor-code">
									{useBackupCode ? "Backup code" : "6-digit code"}
								</Label>
								<Input
									id="two-factor-code"
									value={code}
									onChange={(event) => setCode(event.target.value)}
									required
								/>
							</div>
							<Button type="submit" disabled={pending}>
								{pending ? "Verifying..." : "Verify"}
							</Button>
							<Button
								type="button"
								variant="ghost"
								onClick={() => {
									setUseBackupCode((previous) => !previous);
									setCode("");
								}}
							>
								{useBackupCode
									? "Use authenticator app instead"
									: "Use a backup code instead"}
							</Button>
						</form>
					</CardContent>
				</Card>
			</main>
		);
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
							<div className="flex items-center justify-between">
								<Label htmlFor="password">Password</Label>
								<Link
									to="/forgot-password"
									className="text-xs text-muted-foreground hover:text-primary hover:underline"
								>
									Forgot password?
								</Link>
							</div>
							<Input
								id="password"
								type="password"
								value={password}
								onChange={(event) => setPassword(event.target.value)}
								required
							/>
						</div>
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
