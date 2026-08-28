import {
	createFileRoute,
	Link,
	redirect,
	useRouter,
} from "@tanstack/react-router";
import { CalendarCheck, Link2Off } from "lucide-react";
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

type ResetPasswordSearch = {
	token?: string;
	error?: string;
};

export const Route = createFileRoute("/reset-password")({
	validateSearch: (search): ResetPasswordSearch => {
		const { token, error } = search as Record<string, string | undefined>;
		return { token, error };
	},
	beforeLoad: async () => {
		const session = await getSession();
		if (session) {
			throw redirect({ to: "/dashboard" });
		}
	},
	component: ResetPasswordPage,
});

function ResetPasswordPage() {
	const router = useRouter();
	const { token, error } = Route.useSearch();
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [pending, setPending] = useState(false);

	const invalidLink = !token || error === "INVALID_TOKEN";

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();

		if (newPassword !== confirmPassword) {
			toast.error("Passwords do not match");
			return;
		}

		setPending(true);
		const { error: resetError } = await authClient.resetPassword({
			newPassword,
			token,
		});
		setPending(false);

		if (resetError) {
			toast.error(resetError.message ?? "Failed to reset password");
			return;
		}
		toast.success("Password updated. Please sign in with your new password.");
		await router.navigate({ to: "/login" });
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
					<CardTitle className="text-xl">Set a new password</CardTitle>
					<CardDescription>
						Choose a strong password for your account
					</CardDescription>
				</CardHeader>
				<CardContent>
					{invalidLink ? (
						<div className="flex flex-col items-center gap-4 text-center">
							<Link2Off className="size-10 text-muted-foreground" />
							<p className="text-sm text-muted-foreground">
								This password reset link is invalid or has expired. Request a
								new one to continue.
							</p>
							<Button asChild className="w-fit">
								<Link to="/forgot-password">Request new link</Link>
							</Button>
						</div>
					) : (
						<form onSubmit={handleSubmit} className="flex flex-col gap-4">
							<div className="flex flex-col gap-2">
								<Label htmlFor="new-password">New password</Label>
								<Input
									id="new-password"
									type="password"
									value={newPassword}
									onChange={(event) => setNewPassword(event.target.value)}
									required
									minLength={8}
								/>
							</div>
							<div className="flex flex-col gap-2">
								<Label htmlFor="confirm-password">Confirm new password</Label>
								<Input
									id="confirm-password"
									type="password"
									value={confirmPassword}
									onChange={(event) => setConfirmPassword(event.target.value)}
									required
								/>
							</div>
							<Button type="submit" disabled={pending}>
								{pending ? "Updating..." : "Update password"}
							</Button>
						</form>
					)}
				</CardContent>
			</Card>
		</main>
	);
}
