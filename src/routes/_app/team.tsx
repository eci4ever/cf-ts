import { createFileRoute, redirect } from "@tanstack/react-router";
import { Send, UserCog, UserMinus, UserPlus, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { getSession } from "#/lib/auth.functions";
import { authClient } from "#/lib/auth-client";
import {
	getMyOrgRole,
	listOrgInvitations,
	listOrgMembers,
} from "#/lib/org.functions";
import { setMemberRole } from "#/lib/org-settings.functions";

export const Route = createFileRoute("/_app/team")({
	staticData: { title: "Team" },
	beforeLoad: async () => {
		const session = await getSession();
		if (!session) {
			throw redirect({ to: "/login" });
		}
		if (!session.session.activeOrganizationId) {
			throw redirect({ to: "/onboarding" });
		}
		const role = await getMyOrgRole();
		if (role !== "admin" && role !== "owner") {
			throw redirect({ to: "/dashboard" });
		}
	},
	component: TeamPage,
});

type MemberRow = {
	id: string;
	userId: string;
	name: string;
	email: string;
	role: string;
	joinedAt: Date;
};

type InvitationRow = {
	id: string;
	email: string;
	role: string | null;
	status: string;
	expiresAt: Date;
};

function TeamPage() {
	const [members, setMembers] = useState<MemberRow[]>([]);
	const [invitations, setInvitations] = useState<InvitationRow[]>([]);
	const [loading, setLoading] = useState(true);

	const [inviteEmail, setInviteEmail] = useState("");
	const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
	const [invitePending, setInvitePending] = useState(false);

	const loadAll = useCallback(async () => {
		setLoading(true);
		const [membersResult, invitationsResult] = await Promise.all([
			listOrgMembers(),
			listOrgInvitations(),
		]);
		setMembers(membersResult as MemberRow[]);
		setInvitations(invitationsResult as InvitationRow[]);
		setLoading(false);
	}, []);

	useEffect(() => {
		loadAll();
	}, [loadAll]);

	async function handleInvite(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setInvitePending(true);

		const { error: inviteError } = await authClient.organization.inviteMember({
			email: inviteEmail,
			role: inviteRole,
		});

		setInvitePending(false);

		if (inviteError) {
			toast.error(inviteError.message ?? "Failed to send invitation");
			return;
		}

		setInviteEmail("");
		toast.success(`Invitation sent to ${inviteEmail}`);
		await loadAll();
	}

	async function handleSetRole(
		memberId: string,
		role: "member" | "supervisor" | "admin",
	) {
		const result = await setMemberRole({ data: { userId: memberId, role } });
		if (!result.ok) {
			toast.error(result.reason);
			return;
		}
		toast.success(`Role updated to ${role}`);
		await loadAll();
	}

	async function handleRemove(memberId: string) {
		await authClient.organization.removeMember({ memberIdOrEmail: memberId });
		await loadAll();
	}

	async function handleCancelInvitation(invitationId: string) {
		await authClient.organization.cancelInvitation({ invitationId });
		await loadAll();
	}

	return (
		<div className="flex flex-col gap-4">
			<Card>
				<CardHeader>
					<CardTitle>Invite a teammate</CardTitle>
					<CardDescription>
						They will receive an email invitation to join this company
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form
						onSubmit={handleInvite}
						className="flex flex-col gap-4 sm:flex-row sm:items-end"
					>
						<div className="flex flex-1 flex-col gap-2">
							<Label htmlFor="invite-email">Email</Label>
							<Input
								id="invite-email"
								type="email"
								placeholder="colleague@company.com"
								value={inviteEmail}
								onChange={(event) => setInviteEmail(event.target.value)}
								required
							/>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="invite-role">Role</Label>
							<Select
								value={inviteRole}
								onValueChange={(value) =>
									setInviteRole(value as "member" | "admin")
								}
							>
								<SelectTrigger id="invite-role" className="w-32">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										<SelectItem value="member">member</SelectItem>
										<SelectItem value="admin">admin</SelectItem>
									</SelectGroup>
								</SelectContent>
							</Select>
						</div>
						<Button type="submit" disabled={invitePending}>
							<Send />
							{invitePending ? "Sending..." : "Send invite"}
						</Button>
					</form>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Members</CardTitle>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Name</TableHead>
								<TableHead>Email</TableHead>
								<TableHead>Role</TableHead>
								<TableHead>Joined</TableHead>
								<TableHead className="w-12" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{loading ? (
								<TableRow>
									<TableCell colSpan={5}>Loading...</TableCell>
								</TableRow>
							) : (
								members.map((member) => (
									<TableRow key={member.id}>
										<TableCell className="font-medium">{member.name}</TableCell>
										<TableCell>{member.email}</TableCell>
										<TableCell>
											<Badge variant="secondary">{member.role}</Badge>
										</TableCell>
										<TableCell>
											{new Date(member.joinedAt).toLocaleDateString()}
										</TableCell>
										<TableCell>
											{member.role === "owner" ? null : (
												<DropdownMenu>
													<DropdownMenuTrigger asChild>
														<Button
															variant="ghost"
															size="icon"
															aria-label="Member actions"
														>
															<UserCog />
														</Button>
													</DropdownMenuTrigger>
													<DropdownMenuContent align="end">
														{member.role !== "member" ? (
															<DropdownMenuItem
																onClick={() =>
																	handleSetRole(member.userId, "member")
																}
															>
																<UserPlus />
																Make member
															</DropdownMenuItem>
														) : null}
														{member.role !== "supervisor" ? (
															<DropdownMenuItem
																onClick={() =>
																	handleSetRole(member.userId, "supervisor")
																}
															>
																<UserCog />
																Make supervisor
															</DropdownMenuItem>
														) : null}
														{member.role !== "admin" ? (
															<DropdownMenuItem
																onClick={() =>
																	handleSetRole(member.userId, "admin")
																}
															>
																<UserCog />
																Make admin
															</DropdownMenuItem>
														) : null}
														<DropdownMenuItem
															onClick={() => handleRemove(member.id)}
														>
															<UserMinus />
															Remove
														</DropdownMenuItem>
													</DropdownMenuContent>
												</DropdownMenu>
											)}
										</TableCell>
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Pending invitations</CardTitle>
				</CardHeader>
				<CardContent>
					{invitations.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							No pending invitations.
						</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Email</TableHead>
									<TableHead>Role</TableHead>
									<TableHead>Expires</TableHead>
									<TableHead className="w-12" />
								</TableRow>
							</TableHeader>
							<TableBody>
								{invitations.map((invitation) => (
									<TableRow key={invitation.id}>
										<TableCell>{invitation.email}</TableCell>
										<TableCell>
											<Badge variant="outline">
												{invitation.role ?? "member"}
											</Badge>
										</TableCell>
										<TableCell>
											{new Date(invitation.expiresAt).toLocaleDateString()}
										</TableCell>
										<TableCell>
											<Button
												variant="ghost"
												size="icon"
												aria-label="Cancel invitation"
												onClick={() => handleCancelInvitation(invitation.id)}
											>
												<X />
											</Button>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
