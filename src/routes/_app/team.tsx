import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Send, UserCog, UserMinus, UserPlus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { RoleBadge } from "#/components/role-badge";
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
	hasEmployeeRecord: boolean;
	subordinateCount: number;
};

type InvitationRow = {
	id: string;
	email: string;
	role: string | null;
	status: string;
	expiresAt: Date;
};

function TeamPage() {
	const queryClient = useQueryClient();
	const [inviteEmail, setInviteEmail] = useState("");
	const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");

	const membersQuery = useQuery({
		queryKey: ["team", "members"],
		queryFn: listOrgMembers,
	});
	const invitationsQuery = useQuery({
		queryKey: ["team", "invitations"],
		queryFn: listOrgInvitations,
	});
	const members = (membersQuery.data ?? []) as MemberRow[];
	const invitations = (invitationsQuery.data ?? []) as InvitationRow[];
	const invalidateTeam = () => {
		queryClient.invalidateQueries({ queryKey: ["team"] });
	};

	const inviteMutation = useMutation({
		mutationFn: async (input: { email: string; role: "member" | "admin" }) => {
			const { error } = await authClient.organization.inviteMember({
				email: input.email,
				role: input.role,
			});
			if (error) {
				throw new Error(error.message ?? "Failed to send invitation");
			}
		},
		onSuccess: (_result, variables) => {
			setInviteEmail("");
			toast.success(`Invitation sent to ${variables.email}`);
			invalidateTeam();
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});
	const setRoleMutation = useMutation({
		mutationFn: async (input: {
			memberId: string;
			role: "member" | "supervisor" | "admin";
		}) => {
			const result = await setMemberRole({
				data: { userId: input.memberId, role: input.role },
			});
			if (!result.ok) {
				throw new Error(result.reason);
			}
			return result;
		},
		onSuccess: (_result, variables) => {
			toast.success(`Role updated to ${variables.role}`);
			invalidateTeam();
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});
	const removeMutation = useMutation({
		mutationFn: async (memberId: string) => {
			await authClient.organization.removeMember({ memberIdOrEmail: memberId });
		},
		onSuccess: () => {
			invalidateTeam();
		},
		onError: () => {
			toast.error("Failed to remove member");
		},
	});
	const cancelInviteMutation = useMutation({
		mutationFn: async (invitationId: string) => {
			await authClient.organization.cancelInvitation({ invitationId });
		},
		onSuccess: () => {
			invalidateTeam();
		},
		onError: () => {
			toast.error("Failed to cancel invitation");
		},
	});

	function handleInvite(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		inviteMutation.mutate({ email: inviteEmail, role: inviteRole });
	}

	function handleSetRole(
		memberId: string,
		role: "member" | "supervisor" | "admin",
	) {
		setRoleMutation.mutate({ memberId, role });
	}

	function handleRemove(memberId: string) {
		removeMutation.mutate(memberId);
	}

	function handleCancelInvitation(invitationId: string) {
		cancelInviteMutation.mutate(invitationId);
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
						<Button type="submit" disabled={inviteMutation.isPending}>
							<Send />
							{inviteMutation.isPending ? "Sending..." : "Send invite"}
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
							{membersQuery.isPending ? (
								<TableRow>
									<TableCell colSpan={5}>Loading...</TableCell>
								</TableRow>
							) : (
								members.map((member) => (
									<TableRow key={member.id}>
										<TableCell className="font-medium">{member.name}</TableCell>
										<TableCell>{member.email}</TableCell>
										<TableCell>
											<div className="flex flex-wrap items-center gap-2">
												<RoleBadge role={member.role} />
												{member.role === "supervisor" ? (
													<span className="text-xs text-muted-foreground">
														{member.subordinateCount} subordinate
														{member.subordinateCount === 1 ? "" : "s"}
													</span>
												) : null}
											</div>
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
																{member.hasEmployeeRecord
																	? ""
																	: " (needs employee record)"}
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
