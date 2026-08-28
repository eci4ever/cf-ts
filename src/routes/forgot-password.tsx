import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { CalendarCheck, MailCheck } from "lucide-react";
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

export const Route = createFileRoute("/forgot-password")({
	beforeLoad: async () => {
		const session = await getSession();
		if (session) {
			throw redirect({ to: "/dashboard" });
		}
	},
	component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
	const [email, setEmail] = useState("");
	const [pending, setPending] = useState(false);
	const [sent, setSent] = useState(false);

	async function sendResetLink() {
		setPending(true);

		const { error } = await authClient.requestPasswordReset({
			email,
			redirectTo: "/reset-password",
		});

		setPending(false);

		if (error) {
			toast.error(error.message ?? "Something went wrong");
			return;
		}
		setSent(true);
	}

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		sendResetLink();
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
					<CardTitle className="text-xl">Forgot your password?</CardTitle>
					<CardDescription>
						Enter your email address and we&apos;ll send you a reset link
					</CardDescription>
				</CardHeader>
				<CardContent>
					{sent ? (
						<div className="flex flex-col items-center gap-4 text-center">
							<MailCheck className="size-10 text-muted-foreground" />
							<p className="text-sm text-muted-foreground">
								If an account exists for <strong>{email}</strong>, you will
								receive an email with a link to reset your password. The link
								expires in 1 hour.
							</p>
							<Button
								variant="outline"
								onClick={() => sendResetLink()}
								disabled={pending}
								className="w-fit"
							>
								{pending ? "Sending..." : "Resend email"}
							</Button>
							<Link
								to="/login"
								className="text-sm text-primary hover:underline"
							>
								Back to sign in
							</Link>
						</div>
					) : (
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
							<Button type="submit" disabled={pending}>
								{pending ? "Sending..." : "Send reset link"}
							</Button>
							<p className="text-center text-sm text-muted-foreground">
								Remembered your password?{" "}
								<Link to="/login" className="text-primary hover:underline">
									Sign in
								</Link>
							</p>
						</form>
					)}
				</CardContent>
			</Card>
		</main>
	);
}
