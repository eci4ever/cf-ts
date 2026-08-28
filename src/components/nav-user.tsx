import { Link, useNavigate } from "@tanstack/react-router";
import {
	ChevronsUpDown,
	CircleUserRound,
	LogOut,
	VenetianMask,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "#/components/ui/sidebar";
import { authClient } from "#/lib/auth-client";

export function NavUser() {
	const navigate = useNavigate();
	const { isMobile } = useSidebar();
	const { data } = authClient.useSession();
	const user = data?.user;

	async function handleSignOut() {
		await authClient.signOut();
		await navigate({ to: "/login" });
	}

	async function handleStopImpersonating() {
		await authClient.admin.stopImpersonating();
		await navigate({ to: "/admin" });
	}

	const isImpersonating = Boolean(data?.session.impersonatedBy);

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<SidebarMenuButton
							size="lg"
							className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
						>
							<Avatar className="size-8 rounded-lg">
								{user?.image ? (
									<AvatarImage
										src={user.image}
										alt={user?.name ?? "User avatar"}
									/>
								) : null}
								<AvatarFallback className="rounded-lg">
									{user?.name?.charAt(0).toUpperCase() ?? "U"}
								</AvatarFallback>
							</Avatar>
							<div className="grid flex-1 text-left text-sm leading-tight">
								<span className="truncate font-semibold">
									{user?.name ?? "User"}
								</span>
								<span className="truncate text-xs">{user?.email ?? ""}</span>
							</div>
							<ChevronsUpDown className="ml-auto size-4" />
						</SidebarMenuButton>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
						side={isMobile ? "bottom" : "right"}
						align="end"
						sideOffset={4}
					>
						<DropdownMenuLabel className="p-0 font-normal">
							<div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
								<Avatar className="size-8 rounded-lg">
									{user?.image ? (
										<AvatarImage
											src={user.image}
											alt={user?.name ?? "User avatar"}
										/>
									) : null}
									<AvatarFallback className="rounded-lg">
										{user?.name?.charAt(0).toUpperCase() ?? "U"}
									</AvatarFallback>
								</Avatar>
								<div className="grid flex-1 text-left text-sm leading-tight">
									<span className="truncate font-semibold">
										{user?.name ?? "User"}
									</span>
									<span className="truncate text-xs">{user?.email ?? ""}</span>
								</div>
							</div>
						</DropdownMenuLabel>
						<DropdownMenuSeparator />
						<DropdownMenuItem asChild>
							<Link to="/account">
								<CircleUserRound />
								Account
							</Link>
						</DropdownMenuItem>
						{isImpersonating ? (
							<DropdownMenuItem onClick={handleStopImpersonating}>
								<VenetianMask />
								Stop impersonating
							</DropdownMenuItem>
						) : null}
						<DropdownMenuItem onClick={handleSignOut}>
							<LogOut />
							Log out
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}
