import { AppSidebar } from "#/components/app-sidebar";
import { MobileNavRail } from "#/components/mobile-nav-rail";
import { NotificationBell } from "#/components/notification-bell";
import { ThemeToggle } from "#/components/theme-toggle";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbList,
	BreadcrumbPage,
} from "#/components/ui/breadcrumb";
import { Separator } from "#/components/ui/separator";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "#/components/ui/sidebar";

export function PageShell({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<SidebarProvider>
			<MobileNavRail />
			<AppSidebar />
			<SidebarInset className="max-md:pl-12">
				<header className="flex h-16 shrink-0 items-center gap-2">
					<div className="flex items-center gap-2 px-4">
						<SidebarTrigger className="-ml-1" />
						<Separator
							orientation="vertical"
							className="mr-2 data-[orientation=vertical]:h-4"
						/>
						<Breadcrumb>
							<BreadcrumbList>
								<BreadcrumbItem>
									<BreadcrumbPage>{title}</BreadcrumbPage>
								</BreadcrumbItem>
							</BreadcrumbList>
						</Breadcrumb>
					</div>
					<div className="ml-auto flex items-center gap-1 px-4">
						<NotificationBell />
						<ThemeToggle />
					</div>
				</header>
				<div className="flex flex-1 flex-col gap-4 p-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
					{children}
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
