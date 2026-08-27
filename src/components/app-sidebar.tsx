import { Link, useRouterState } from "@tanstack/react-router";
import {
	BarChart3,
	CalendarCheck,
	CalendarDays,
	LayoutDashboard,
	Timer,
	Users,
} from "lucide-react";
import { NavUser } from "#/components/nav-user";
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

const navItems = [
	{ title: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
	{ title: "Attendance", to: "/attendance", icon: Timer },
	{ title: "Employees", to: "/employees", icon: Users },
	{ title: "Leave", to: "/leave", icon: CalendarDays },
	{ title: "Reports", to: "/reports", icon: BarChart3 },
] as const;

export function AppSidebar() {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});

	return (
		<Sidebar collapsible="icon">
			<SidebarHeader className="pt-4">
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton size="lg" asChild>
							<Link to="/dashboard">
								<span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
									<CalendarCheck className="size-4" />
								</span>
								<span className="flex flex-col gap-0.5 leading-none group-data-[collapsible=icon]:hidden">
									<span className="font-semibold">Attendance</span>
									<span className="text-xs">Management System</span>
								</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupLabel>Main</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{navItems.map((item) => (
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
