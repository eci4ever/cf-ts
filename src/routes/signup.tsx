import {
	createFileRoute,
	Link,
	redirect,
	useRouter,
} from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AuthShell } from "#/components/auth-layout";
import { GoogleButton } from "#/components/google-sign-in-button";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { getSession } from "#/lib/auth.functions";
import { authClient } from "#/lib/auth-client";

export const Route = createFileRoute("/signup")({
	beforeLoad: async () => {
		const session = await getSession();
		if (session) {
			throw redirect({ to: "/dashboard" });
		}
	},
	component: SignupPage,
});

function SignupPage() {
	const router = useRouter();
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [pending, setPending] = useState(false);

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setPending(true);

		const { error: signUpError } = await authClient.signUp.email({
			name,
			email,
			password,
		});

		setPending(false);

		if (signUpError) {
			toast.error(signUpError.message ?? "Something went wrong");
			return;
		}

		await router.invalidate();
		await router.navigate({ to: "/dashboard" });
	}

	return (
		<AuthShell
			title="Create your account"
			description="Start tracking attendance for your team today"
		>
			<GoogleButton label="Sign up with Google" callbackURL="/onboarding" />
			<form onSubmit={handleSubmit} className="flex flex-col gap-4">
				<div className="flex flex-col gap-2">
					<Label htmlFor="name">Name</Label>
					<Input
						id="name"
						placeholder="Jane Smith"
						value={name}
						onChange={(event) => setName(event.target.value)}
						required
					/>
				</div>
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
						minLength={8}
						value={password}
						onChange={(event) => setPassword(event.target.value)}
						required
					/>
					<p className="text-xs text-muted-foreground">At least 8 characters</p>
				</div>
				<Button type="submit" disabled={pending}>
					{pending ? "Creating account..." : "Create account"}
				</Button>
				<p className="text-center text-xs text-muted-foreground">
					Free for up to 5 employees · No credit card required
				</p>
				<p className="text-center text-sm text-muted-foreground">
					Already have an account?{" "}
					<Link
						to="/login"
						className="font-medium text-primary hover:underline"
					>
						Sign in
					</Link>
				</p>
			</form>
		</AuthShell>
	);
}
