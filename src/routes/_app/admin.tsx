import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { MoreHorizontal, ShieldOff, UserCog, VenetianMask } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { Skeleton } from "#/components/ui/skeleton";
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

export const Route = createFileRoute("/_app/admin")({
	staticData: { title: "Admin" },
	beforeLoad: async () => {
		const session = await getSession();
		if (!session) {
			throw redirect({ to: "/login" });
		}
		if (!session.user.role?.split(",").includes("admin")) {
			throw redirect({ to: "/dashboard" });
		}
	},
	component: AdminPage,
});

type UserRow = {
	id: string;
	name: string;
	email: string;
	role?: string | null;
	banned?: boolean | null;
};

function AdminPage() {
	const router = useRouter();
	const [users, setUsers] = useState<UserRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const loadUsers = useCallback(async () => {
		setLoading(true);
		setError(null);
		const { data, error: listError } = await authClient.admin.listUsers({
			query: { limit: 100, sortBy: "createdAt" },
		});
		if (listError) {
			setError(listError.message ?? "Failed to load users");
		} else {
			setUsers((data?.users ?? []) as UserRow[]);
		}
		setLoading(false);
	}, []);

	useEffect(() => {
		loadUsers();
	}, [loadUsers]);

	async function handleSetRole(userId: string, role: "user" | "admin") {
		await authClient.admin.setRole({ userId, role });
		await loadUsers();
	}

	async function handleBan(userId: string) {
		await authClient.admin.banUser({ userId });
		await loadUsers();
	}

	async function handleUnban(userId: string) {
		await authClient.admin.unbanUser({ userId });
		await loadUsers();
	}

	async function handleImpersonate(userId: string) {
		const { error } = await authClient.admin.impersonateUser({ userId });
		if (error) {
			setError(error.message ?? "Failed to impersonate user");
			return;
		}
		await router.invalidate();
		await router.navigate({ to: "/dashboard" });
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>User management</CardTitle>
			</CardHeader>
			<CardContent>
				{error ? <p className="text-sm text-destructive">{error}</p> : null}
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Name</TableHead>
							<TableHead>Email</TableHead>
							<TableHead>Role</TableHead>
							<TableHead>Status</TableHead>
							<TableHead className="w-12" />
						</TableRow>
					</TableHeader>
					<TableBody>
						{loading ? (
							["first", "second", "third"].map((row) => (
								<TableRow key={row}>
									<TableCell colSpan={5}>
										<Skeleton className="h-5 w-full" />
									</TableCell>
								</TableRow>
							))
						) : users.length === 0 ? (
							<TableRow>
								<TableCell
									colSpan={5}
									className="text-center text-muted-foreground"
								>
									No users found.
								</TableCell>
							</TableRow>
						) : (
							users.map((user) => (
								<TableRow key={user.id}>
									<TableCell className="font-medium">{user.name}</TableCell>
									<TableCell>{user.email}</TableCell>
									<TableCell>
										<Badge variant="secondary">
											{user.role?.split(",").includes("admin")
												? "admin"
												: "user"}
										</Badge>
									</TableCell>
									<TableCell>
										<Badge variant={user.banned ? "destructive" : "outline"}>
											{user.banned ? "Banned" : "Active"}
										</Badge>
									</TableCell>
									<TableCell>
										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<Button
													variant="ghost"
													size="icon"
													aria-label="User actions"
												>
													<MoreHorizontal className="size-4" />
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent align="end">
												<DropdownMenuLabel>Actions</DropdownMenuLabel>
												<DropdownMenuItem
													onClick={() => handleImpersonate(user.id)}
												>
													<VenetianMask />
													Impersonate
												</DropdownMenuItem>
												{user.role?.split(",").includes("admin") ? (
													<DropdownMenuItem
														onClick={() => handleSetRole(user.id, "user")}
													>
														<UserCog />
														Make user
													</DropdownMenuItem>
												) : (
													<DropdownMenuItem
														onClick={() => handleSetRole(user.id, "admin")}
													>
														<UserCog />
														Make admin
													</DropdownMenuItem>
												)}
												{user.banned ? (
													<DropdownMenuItem
														onClick={() => handleUnban(user.id)}
													>
														<ShieldOff />
														Unban
													</DropdownMenuItem>
												) : (
													<DropdownMenuItem onClick={() => handleBan(user.id)}>
														<ShieldOff />
														Ban
													</DropdownMenuItem>
												)}
											</DropdownMenuContent>
										</DropdownMenu>
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</CardContent>
		</Card>
	);
}
