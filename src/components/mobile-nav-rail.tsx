import { Link, useRouteContext, useRouterState } from "@tanstack/react-router";
import { navGroups, visibleItems } from "#/components/app-sidebar";
import { NavUser } from "#/components/nav-user";
import { OrgSwitcher } from "#/components/org-switcher";
import {
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "#/components/ui/sidebar";

export function MobileNavRail() {
	const { orgRole, isPlatformAdmin } = useRouteContext({ from: "/_app" });
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const isOrgAdmin = orgRole === "admin" || orgRole === "owner";
	const groups = navGroups
		.map((group) => ({
			group,
			items: visibleItems(group, isOrgAdmin, isPlatformAdmin),
		}))
		.filter(({ items }) => items.length > 0);

	return (
		<nav
			data-slot="mobile-nav-rail"
			data-sidebar="sidebar"
			data-state="collapsed"
			data-collapsible="icon"
			className="group fixed inset-y-0 left-0 z-30 flex w-12 flex-col border-r bg-sidebar pb-[calc(0.75rem+env(safe-area-inset-bottom))] text-sidebar-foreground md:hidden [&_[data-sidebar=menu-button]]:size-10!"
		>
			<SidebarHeader className="pt-3">
				<OrgSwitcher />
			</SidebarHeader>
			<SidebarContent className="py-2">
				{groups.map(({ group, items }) => (
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
		</nav>
	);
}
