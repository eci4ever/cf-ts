import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	redirect,
	useRouter,
} from "@tanstack/react-router";
import { Building2, CalendarCheck, Mail } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "#/components/ui/badge";
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
import { listMyInvitations } from "#/lib/org.functions";

export const Route = createFileRoute("/onboarding")({
	beforeLoad: async () => {
		const session = await getSession();
		if (!session) {
			throw redirect({ to: "/login" });
		}
		if (session.session.activeOrganizationId) {
			throw redirect({ to: "/dashboard" });
		}
	},
	component: OnboardingPage,
});

type InvitationRow = {
	id: string;
	organizationId: string;
	organizationName: string;
	role: string | null;
	expiresAt: Date;
};

function OnboardingPage() {
	const router = useRouter();
	const queryClient = useQueryClient();
	const [name, setName] = useState("");
	const [createPending, setCreatePending] = useState(false);
	const [acceptingId, setAcceptingId] = useState<string | null>(null);
	const invitationsQuery = useQuery({
		queryKey: ["invitations", "mine"],
		queryFn: listMyInvitations,
	});
	const invitations = (invitationsQuery.data ?? []) as InvitationRow[];

	async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setCreatePending(true);

		const slug = `${name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/(^-|-$)/g, "")}-${crypto.randomUUID().slice(0, 8)}`;

		const { data, error } = await authClient.organization.create({
			name,
			slug,
		});

		if (error || !data) {
			toast.error(error?.message ?? "Something went wrong");
			setCreatePending(false);
			return;
		}

		await authClient.organization.setActive({ organizationId: data.id });
		setCreatePending(false);
		await router.invalidate();
		await router.navigate({ to: "/dashboard" });
	}

	async function handleAccept(invitation: InvitationRow) {
		setAcceptingId(invitation.id);

		const { error } = await authClient.organization.acceptInvitation({
			invitationId: invitation.id,
		});

		if (error) {
			toast.error(error.message ?? "Failed to accept invitation");
			setAcceptingId(null);
			return;
		}

		await authClient.organization.setActive({
			organizationId: invitation.organizationId,
		});
		setAcceptingId(null);
		await router.invalidate();
		await router.navigate({ to: "/dashboard" });
	}

	async function handleDecline(invitation: InvitationRow) {
		setAcceptingId(invitation.id);
		const { error } = await authClient.organization.rejectInvitation({
			invitationId: invitation.id,
		});
		if (error) {
			toast.error(error.message ?? "Failed to decline invitation");
		}
		setAcceptingId(null);
		await router.invalidate();
		queryClient.invalidateQueries({ queryKey: ["invitations", "mine"] });
	}

	async function handleSignOut() {
		await authClient.signOut();
		await router.invalidate();
		await router.navigate({ to: "/login" });
	}

	return (
		<main className="flex min-h-svh items-center justify-center bg-background p-6">
			<div className="flex w-full max-w-md flex-col gap-4">
				<div className="text-center">
					<Link
						to="/"
						aria-label="Back to home"
						className="mx-auto mb-2 flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90"
					>
						<CalendarCheck className="size-5" />
					</Link>
					<h1 className="text-xl font-semibold">Get started</h1>
					<p className="text-sm text-muted-foreground">
						Create your company or accept an invitation to join one
					</p>
				</div>

				{invitations.length > 0 ? (
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-base">
								<Mail className="size-4" />
								Pending invitations
							</CardTitle>
							<CardDescription>
								These were sent to your email address
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-3">
							{invitations.map((invitation) => (
								<div
									key={invitation.id}
									className="flex items-center justify-between gap-2 rounded-lg border p-3"
								>
									<div className="min-w-0">
										<p className="truncate text-sm font-medium">
											{invitation.organizationName}
										</p>
										<Badge variant="secondary" className="mt-1">
											{invitation.role ?? "member"}
										</Badge>
									</div>
									<div className="flex shrink-0 gap-2">
										<Button
											size="sm"
											disabled={acceptingId !== null}
											onClick={() => handleAccept(invitation)}
										>
											{acceptingId === invitation.id ? "Joining..." : "Accept"}
										</Button>
										<Button
											size="sm"
											variant="outline"
											disabled={acceptingId !== null}
											onClick={() => handleDecline(invitation)}
										>
											Decline
										</Button>
									</div>
								</div>
							))}
						</CardContent>
					</Card>
				) : null}

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-base">
							<Building2 className="size-4" />
							Create your company
						</CardTitle>
						<CardDescription>
							You will be the owner and can invite your team afterwards
						</CardDescription>
					</CardHeader>
					<CardContent>
						<form onSubmit={handleCreate} className="flex flex-col gap-4">
							<div className="flex flex-col gap-2">
								<Label htmlFor="company-name">Company name</Label>
								<Input
									id="company-name"
									placeholder="Acme Inc"
									value={name}
									onChange={(event) => setName(event.target.value)}
									required
								/>
							</div>
							<Button type="submit" disabled={createPending}>
								{createPending ? "Creating..." : "Create company"}
							</Button>
						</form>
					</CardContent>
				</Card>

				<Button variant="ghost" onClick={handleSignOut}>
					Sign out
				</Button>
			</div>
		</main>
	);
}
