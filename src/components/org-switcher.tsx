import { CalendarCheck, Check, ChevronsUpDown, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "#/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "#/components/ui/sidebar";
import { authClient } from "#/lib/auth-client";

export function OrgSwitcher() {
	const { isMobile } = useSidebar();
	const { data: organizations, isPending } = authClient.useListOrganizations();
	const { data: activeOrganization } = authClient.useActiveOrganization();
	const autoSelected = useRef(false);

	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const activeOrg = activeOrganization ?? organizations?.[0];

	useEffect(() => {
		if (autoSelected.current || isPending) return;
		if (!activeOrganization && organizations && organizations.length > 0) {
			autoSelected.current = true;
			authClient.organization.setActive({
				organizationId: organizations[0].id,
			});
		}
	}, [activeOrganization, isPending, organizations]);

	async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		setPending(true);

		const slug = `${name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/(^-|-$)/g, "")}-${crypto.randomUUID().slice(0, 8)}`;

		const { data, error: createError } = await authClient.organization.create({
			name,
			slug,
		});

		if (createError || !data) {
			setError(createError?.message ?? "Something went wrong");
			setPending(false);
			return;
		}

		await authClient.organization.setActive({ organizationId: data.id });
		setPending(false);
		setOpen(false);
		setName("");
	}

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<SidebarMenuButton
							size="lg"
							className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
						>
							<span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
								{activeOrg ? (
									<span className="text-sm font-semibold">
										{activeOrg.name.charAt(0).toUpperCase()}
									</span>
								) : (
									<CalendarCheck className="size-4" />
								)}
							</span>
							<span className="flex flex-1 flex-col gap-0.5 leading-none">
								<span className="truncate font-semibold">
									{activeOrg?.name ?? "Attendance"}
								</span>
								<span className="truncate text-xs">
									{activeOrg ? "Workspace" : "Management System"}
								</span>
							</span>
							<ChevronsUpDown className="ml-auto size-4" />
						</SidebarMenuButton>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
						side={isMobile ? "bottom" : "right"}
						align="start"
						sideOffset={4}
					>
						<DropdownMenuLabel>Organizations</DropdownMenuLabel>
						{isPending ? (
							<DropdownMenuItem disabled>Loading...</DropdownMenuItem>
						) : (
							(organizations ?? []).map((org) => (
								<DropdownMenuItem
									key={org.id}
									onClick={() =>
										authClient.organization.setActive({
											organizationId: org.id,
										})
									}
								>
									<span className="flex size-6 shrink-0 items-center justify-center rounded-md border text-xs font-semibold">
										{org.name.charAt(0).toUpperCase()}
									</span>
									<span className="truncate">{org.name}</span>
									{activeOrg?.id === org.id ? (
										<Check className="ml-auto size-4" />
									) : null}
								</DropdownMenuItem>
							))
						)}
						<DropdownMenuSeparator />
						<Dialog open={open} onOpenChange={setOpen}>
							<DialogTrigger asChild>
								<DropdownMenuItem onSelect={(event) => event.preventDefault()}>
									<Plus />
									Create organization
								</DropdownMenuItem>
							</DialogTrigger>
							<DialogContent>
								<DialogHeader>
									<DialogTitle>Create organization</DialogTitle>
									<DialogDescription>
										A new workspace for your team. You become its owner.
									</DialogDescription>
								</DialogHeader>
								<form onSubmit={handleCreate} className="flex flex-col gap-4">
									<div className="flex flex-col gap-2">
										<Label htmlFor="org-name">Organization name</Label>
										<Input
											id="org-name"
											placeholder="Acme Inc"
											value={name}
											onChange={(event) => setName(event.target.value)}
											required
										/>
									</div>
									{error ? (
										<p className="text-sm text-destructive">{error}</p>
									) : null}
									<DialogFooter>
										<Button type="submit" disabled={pending}>
											{pending ? "Creating..." : "Create"}
										</Button>
									</DialogFooter>
								</form>
							</DialogContent>
						</Dialog>
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}
