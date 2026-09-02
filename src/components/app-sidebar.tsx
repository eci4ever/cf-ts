import { Link, useRouteContext, useRouterState } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
	BarChart3,
	Building2,
	CalendarDays,
	Gauge,
	LayoutDashboard,
	ScrollText,
	Settings,
	Timer,
	UserCog,
	Users,
	UsersRound,
	Wallet,
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

type NavGroup = {
	label: string;
	items: NavItem[];
};

export const navGroups: NavGroup[] = [
	{
		label: "Main",
		items: [
			{ title: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
			{ title: "Attendance", to: "/attendance", icon: Timer },
			{ title: "Leave", to: "/leave", icon: CalendarDays },
			{ title: "Reports", to: "/reports", icon: BarChart3 },
		],
	},
	{
		label: "Org Admin",
		items: [
			{ title: "Employees", to: "/employees", icon: Users, orgAdminOnly: true },
			{ title: "Team", to: "/team", icon: UserCog, orgAdminOnly: true },
			{ title: "Billing", to: "/billing", icon: Wallet, orgAdminOnly: true },
			{
				title: "Settings",
				to: "/settings",
				icon: Settings,
				orgAdminOnly: true,
			},
		],
	},
	{
		label: "Platform Admin",
		items: [
			{
				title: "Overview",
				to: "/admin",
				icon: Gauge,
				adminOnly: true,
			},
			{ title: "Users", to: "/admin/users", icon: UsersRound, adminOnly: true },
			{
				title: "Organization",
				to: "/admin/organizations",
				icon: Building2,
				adminOnly: true,
			},
			{
				title: "Audit log",
				to: "/admin/audit",
				icon: ScrollText,
				adminOnly: true,
			},
		],
	},
];

export function visibleItems(
	group: NavGroup,
	isOrgAdmin: boolean,
	isPlatformAdmin: boolean,
): NavItem[] {
	return group.items.filter(
		(item) =>
			(!item.adminOnly || isPlatformAdmin) &&
			(!item.orgAdminOnly || isOrgAdmin),
	);
}

export function AppSidebar() {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const { orgRole, isPlatformAdmin } = useRouteContext({ from: "/_app" });
	const isOrgAdmin = orgRole === "admin" || orgRole === "owner";

	return (
		<Sidebar collapsible="icon">
			<SidebarHeader className="pt-2 group-data-[collapsible=icon]:pt-4">
				<OrgSwitcher />
			</SidebarHeader>
			<SidebarContent>
				{navGroups
					.map((group) => ({
						group,
						items: visibleItems(group, isOrgAdmin, isPlatformAdmin),
					}))
					.filter(({ items }) => items.length > 0)
					.map(({ group, items }) => (
						<SidebarGroup key={group.label}>
							<SidebarGroupLabel>{group.label}</SidebarGroupLabel>
							<SidebarGroupContent>
								<SidebarMenu>
									{items.map((item) => (
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
					))}
			</SidebarContent>
			<SidebarFooter>
				<NavUser />
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
