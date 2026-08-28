import { Link, useRouteContext, useRouterState } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
	BarChart3,
	CalendarDays,
	LayoutDashboard,
	ShieldCheck,
	Timer,
	UserCog,
	Users,
} from "lucide-react";
import { NavUser } from "#/components/nav-user";
import { OrgSwitcher } from "#/components/org-switcher";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
} from "#/components/ui/sidebar";

type NavItem = {
	title: string;
	to: string;
	icon: LucideIcon;
	adminOnly?: boolean;
	orgAdminOnly?: boolean;
};

const navItems: NavItem[] = [
	{ title: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
	{ title: "Attendance", to: "/attendance", icon: Timer },
	{ title: "Employees", to: "/employees", icon: Users },
	{ title: "Leave", to: "/leave", icon: CalendarDays },
	{ title: "Reports", to: "/reports", icon: BarChart3 },
	{ title: "Team", to: "/team", icon: UserCog, orgAdminOnly: true },
	{ title: "Admin", to: "/admin", icon: ShieldCheck, adminOnly: true },
];

export function AppSidebar() {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const { orgRole, isPlatformAdmin } = useRouteContext({ from: "/_app" });
	const isOrgAdmin = orgRole === "admin" || orgRole === "owner";

	return (
		<Sidebar collapsible="icon">
			<SidebarHeader className="pt-4">
				<OrgSwitcher />
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupLabel>Main</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{navItems
								.filter(
									(item) =>
										(!item.adminOnly || isPlatformAdmin) &&
										(!item.orgAdminOnly || isOrgAdmin),
								)
								.map((item) => (
									<SidebarMenuItem key={item.to}>
										<SidebarMenuButton
											asChild
											isActive={pathname === item.to}
											tooltip={item.title}
										>
											<Link to={item.to}>
												<item.icon />
												<span>{item.title}</span>
											</Link>
										</SidebarMenuButton>
									</SidebarMenuItem>
								))}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>
			<SidebarFooter>
				<NavUser />
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
