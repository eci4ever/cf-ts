import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import {
	type ColumnDef,
	getCoreRowModel,
	getSortedRowModel,
	useReactTable,
} from "@tanstack/react-table";
import { MoreHorizontal, Plus, UserRoundCog } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DataTable, SortableHeader } from "#/components/data-table/data-table";
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
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
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
	createEmployee,
	linkEmployee,
	listEmployees,
	listLinkableMembers,
	setEmployeeActive,
	suggestEmployeeNo,
	updateEmployee,
} from "#/lib/employees.functions";
import { getGeofenceSettings } from "#/lib/geofence.functions";
import { getMyOrgRole } from "#/lib/org.functions";

export const Route = createFileRoute("/_app/employees")({
	staticData: { title: "Employees" },
	beforeLoad: async () => {
		const role = await getMyOrgRole();
		if (role !== "admin" && role !== "owner") {
			throw redirect({ to: "/dashboard" });
		}
	},
	component: EmployeesPage,
});

type EmployeeRow = {
	id: string;
	name: string;
	employeeNo: string;
	position: string | null;
	shift: string;
	joinedAt: Date | null;
	isActive: boolean;
	supervisorId: string | null;
	supervisorName: string | null;
	siteId: string | null;
	siteName: string | null;
	linkedEmail: string | null;
	linkedName: string | null;
};

type EmployeeForm = {
	id?: string;
	name: string;
	employeeNo: string;
	position: string;
	shift: string;
	joinedAt: string;
	supervisorId: string;
	siteId: string;
};

function EmployeesPage() {
	const queryClient = useQueryClient();
	const [sorting, setSorting] = useState([{ id: "employeeNo", desc: false }]);
	const [formOpen, setFormOpen] = useState(false);
	const [editing, setEditing] = useState<EmployeeRow | null>(null);
	const [initialMemberId, setInitialMemberId] = useState<string | null>(null);
	const employeesQuery = useQuery({
		queryKey: ["employees", "list"],
		queryFn: listEmployees,
	});
	const linkableQuery = useQuery({
		queryKey: ["employees", "linkable"],
		queryFn: listLinkableMembers,
	});
	const toggleMutation = useMutation({
		mutationFn: async (input: {
			employeeId: string;
			isActive: boolean;
			name: string;
		}) => {
			const result = await setEmployeeActive({
				data: { employeeId: input.employeeId, isActive: input.isActive },
			});
			if (!result.ok) {
				throw new Error(result.reason);
			}
			return result;
		},
		onSuccess: (_result, variables) => {
			toast.success(
				variables.isActive
					? `${variables.name} deactivated`
					: `${variables.name} activated`,
			);
			queryClient.invalidateQueries({ queryKey: ["employees"] });
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});
	const employees = (employeesQuery.data ?? []) as EmployeeRow[];

	const openAdd = useCallback(
		(memberId?: string) => {
			setEditing(null);
			setInitialMemberId(memberId ?? null);
			setFormOpen(true);
		},
		[],
	);

	const openEdit = useCallback((employee: EmployeeRow) => {
		setEditing(employee);
		setInitialMemberId(null);
		setFormOpen(true);
	}, []);

	function handleSaved() {
		setFormOpen(false);
		toast.success(editing ? "Employee updated" : "Employee added");
		queryClient.invalidateQueries({ queryKey: ["employees"] });
	}

	const handleToggleActive = useCallback(
		(employee: EmployeeRow) => {
			toggleMutation.mutate({
				employeeId: employee.id,
				isActive: !employee.isActive,
				name: employee.name,
			});
		},
		[toggleMutation],
	);

	const columns = useMemo<ColumnDef<EmployeeRow>[]>(
		() => [
			{
				accessorKey: "employeeNo",
				header: ({ column }) => (
					<SortableHeader column={column} title="Employee No" />
				),
			},
			{
				accessorKey: "name",
				header: ({ column }) => <SortableHeader column={column} title="Name" />,
			},
			{ accessorKey: "position", header: "Position" },
			{
				accessorKey: "shift",
				header: "Shift",
				cell: ({ row }) => (
					<Badge variant="secondary">{row.original.shift}</Badge>
				),
			},
			{
				accessorKey: "supervisorName",
				header: "Supervisor",
				cell: ({ row }) =>
					row.original.supervisorName ?? (
						<span className="text-xs text-muted-foreground">—</span>
					),
			},
			{
				accessorKey: "siteName",
				header: "Site",
				cell: ({ row }) =>
					row.original.siteName ?? (
						<span className="text-xs text-muted-foreground">—</span>
					),
			},
			{
				accessorKey: "linkedEmail",
				header: "Account",
				cell: ({ row }) =>
					row.original.linkedEmail ? (
						<span className="text-sm">{row.original.linkedEmail}</span>
					) : (
						<span className="text-xs text-muted-foreground">
							Not linked — admin key-in
						</span>
					),
			},
			{
				accessorKey: "isActive",
				header: "Status",
				cell: ({ row }) => (
					<Badge variant={row.original.isActive ? "outline" : "secondary"}>
						{row.original.isActive ? "Active" : "Inactive"}
					</Badge>
				),
			},
			{
				id: "actions",
				header: "",
				cell: ({ row }) => {
					const employee = row.original;
					return (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									aria-label={`Actions for ${employee.name}`}
								>
									<MoreHorizontal />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuItem onClick={() => openEdit(employee)}>
									<UserRoundCog />
									Edit / link
								</DropdownMenuItem>
								<DropdownMenuItem onClick={() => handleToggleActive(employee)}>
									{employee.isActive ? "Deactivate" : "Activate"}
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					);
				},
			},
		],
		// handlers are stable enough for display purposes; form state lives outside
		[openEdit, handleToggleActive],
	);

	const table = useReactTable({
		data: employees,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		onSortingChange: setSorting,
		state: { sorting },
	});

	return (
		<div className="flex flex-col gap-4">
			<OnboardingCard
				members={linkableQuery.data ?? []}
				employees={employees}
				loading={linkableQuery.isPending || employeesQuery.isPending}
				onAddForMember={(memberId) => openAdd(memberId)}
				onLinkEmployee={(employee) => openEdit(employee)}
			/>
			<Card>
				<CardHeader>
					<CardTitle>Employees</CardTitle>
					<CardDescription>
						Employee records can exist without an account — link them to a
						member later so they can clock in themselves. Deactivated employees
						keep their attendance history.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<DataTable
						table={table}
						loading={employeesQuery.isPending}
						columnCount={columns.length}
						toolbar={
							<Button size="sm" onClick={() => openAdd()}>
								<Plus />
								Add employee
							</Button>
						}
					/>
				</CardContent>
			</Card>
			<EmployeeFormDialog
				open={formOpen}
				editing={editing}
				employees={employees}
				initialMemberId={initialMemberId}
				onOpenChange={(open) => {
					if (!open) {
						setFormOpen(false);
						setEditing(null);
						setInitialMemberId(null);
					}
				}}
				onSaved={handleSaved}
			/>
		</div>
	);
}

function OnboardingCard({
	members,
	employees,
	loading,
	onAddForMember,
	onLinkEmployee,
}: {
	members: { userId: string; name: string; email: string }[];
	employees: EmployeeRow[];
	loading: boolean;
	onAddForMember: (memberId: string) => void;
	onLinkEmployee: (employee: EmployeeRow) => void;
}) {
	const unlinkedEmployees = employees.filter(
		(employee) => employee.isActive && !employee.linkedEmail,
	);
	if (loading) {
		return null;
	}
	if (members.length === 0 && unlinkedEmployees.length === 0) {
		return null;
	}
	return (
		<Card>
			<CardHeader>
				<CardTitle>Onboarding</CardTitle>
				<CardDescription>
					Finish linking accounts so employees can clock in themselves
				</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-4 lg:grid-cols-2">
				<div className="flex flex-col gap-2">
					<p className="text-sm font-medium">
						Members without an employee record ({members.length})
					</p>
					{members.length === 0 ? (
						<p className="text-xs text-muted-foreground">
							Every member has an employee record.
						</p>
					) : (
						<ul className="flex flex-col gap-1">
							{members.map((member) => (
								<li
									key={member.userId}
									className="flex items-center justify-between gap-2 rounded border px-3 py-1.5 text-sm"
								>
									<span className="min-w-0 truncate">
										{member.name}{" "}
										<span className="text-muted-foreground">
											{member.email}
										</span>
									</span>
									<Button
										size="sm"
										variant="outline"
										onClick={() => onAddForMember(member.userId)}
									>
										Add employee
									</Button>
								</li>
							))}
						</ul>
					)}
				</div>
				<div className="flex flex-col gap-2">
					<p className="text-sm font-medium">
						Employees without an account ({unlinkedEmployees.length})
					</p>
					{unlinkedEmployees.length === 0 ? (
						<p className="text-xs text-muted-foreground">
							Every active employee is linked.
						</p>
					) : (
						<ul className="flex flex-col gap-1">
							{unlinkedEmployees.map((employee) => (
								<li
									key={employee.id}
									className="flex items-center justify-between gap-2 rounded border px-3 py-1.5 text-sm"
								>
									<span className="min-w-0 truncate">
										{employee.name}{" "}
										<span className="text-muted-foreground">
											{employee.employeeNo}
										</span>
									</span>
									<Button
										size="sm"
										variant="outline"
										onClick={() => onLinkEmployee(employee)}
									>
										Link account
									</Button>
								</li>
							))}
						</ul>
					)}
				</div>
			</CardContent>
		</Card>
	);
}

function EmployeeFormDialog({
	open,
	editing,
	employees,
	initialMemberId,
	onOpenChange,
	onSaved,
}: {
	open: boolean;
	editing: EmployeeRow | null;
	employees: EmployeeRow[];
	initialMemberId?: string | null;
	onOpenChange: (open: boolean) => void;
	onSaved: () => void;
}) {
	const [form, setForm] = useState<EmployeeForm>({
		name: "",
		employeeNo: "",
		position: "",
		shift: "normal",
		joinedAt: "",
		supervisorId: "",
		siteId: "",
	});
	const sitesQuery = useQuery({
		queryKey: ["geofence", "settings"],
		queryFn: getGeofenceSettings,
		enabled: open,
	});
	const sites = sitesQuery.data?.sites ?? [];
	const [linkable, setLinkable] = useState<
		{ userId: string; name: string; email: string }[]
	>([]);
	const [linkTarget, setLinkTarget] = useState<string>("");
	const saveMutation = useMutation({
		mutationFn: async (input: { linkTarget?: string }) => {
			if (editing) {
				const result = await updateEmployee({
					data: {
						employeeId: editing.id,
						name: form.name,
						employeeNo: form.employeeNo,
						position: form.position,
						shift: form.shift,
						joinedAt: form.joinedAt || undefined,
						supervisorId:
							form.supervisorId && form.supervisorId !== "none"
								? form.supervisorId
								: null,
						siteId: form.siteId && form.siteId !== "none" ? form.siteId : null,
					},
				});
				if (!result.ok) {
					throw new Error(result.reason);
				}
				if (input.linkTarget) {
					const linkResult = await linkEmployee({
						data: { employeeId: editing.id, targetUserId: input.linkTarget },
					});
					if (!linkResult.ok) {
						throw new Error(linkResult.reason);
					}
					toast.success("Member linked to employee");
				}
				return result;
			}
			const result = await createEmployee({
				data: {
					name: form.name,
					employeeNo: form.employeeNo,
					position: form.position,
					shift: form.shift,
					joinedAt: form.joinedAt || undefined,
					siteId: form.siteId && form.siteId !== "none" ? form.siteId : null,
				},
			});
			if (!result.ok) {
				throw new Error(result.reason);
			}
			if (input.linkTarget && result.id) {
				const linkResult = await linkEmployee({
					data: { employeeId: result.id, targetUserId: input.linkTarget },
				});
				if (!linkResult.ok) {
					throw new Error(linkResult.reason);
				}
				toast.success("Member linked to employee");
			}
			return result;
		},
		onSuccess: () => {
			onSaved();
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});

	const supervisorOptions = employees.filter(
		(candidate) =>
			candidate.id !== editing?.id &&
			candidate.id !== form.id &&
			candidate.isActive,
	);

	useEffect(() => {
		if (!open) {
			return;
		}
		setForm(
			editing
				? {
						id: editing.id,
						name: editing.name,
						employeeNo: editing.employeeNo,
						position: editing.position ?? "",
						shift: editing.shift,
						joinedAt: editing.joinedAt
							? new Date(editing.joinedAt).toISOString().slice(0, 10)
							: "",
						supervisorId: editing.supervisorId ?? "",
						siteId: editing.siteId ?? "none",
					}
				: {
						name: "",
						employeeNo: "",
						position: "",
						shift: "normal",
						joinedAt: "",
						supervisorId: "",
						siteId: "none",
					},
		);
		setLinkTarget(initialMemberId ?? "");
		listLinkableMembers()
			.then(setLinkable)
			.catch(() => setLinkable([]));
		if (!editing) {
			suggestEmployeeNo()
				.then(({ suggestion }) =>
					setForm((previous) => ({
						...previous,
						employeeNo: previous.employeeNo || suggestion,
					})),
				)
				.catch(() => {});
		}
	}, [open, editing, initialMemberId]);

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		saveMutation.mutate({ linkTarget: linkTarget || undefined });
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{editing ? `Edit ${editing.name}` : "Add employee"}
					</DialogTitle>
					<DialogDescription>
						{editing
							? "Update employee details and shift type."
							: "Employees without an account are keyed in manually by admins."}
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={handleSubmit} className="flex flex-col gap-4">
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="flex flex-col gap-2">
							<Label htmlFor="employee-name">Name</Label>
							<Input
								id="employee-name"
								value={form.name}
								onChange={(event) =>
									setForm({ ...form, name: event.target.value })
								}
								required
							/>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="employee-no">Employee no</Label>
							<Input
								id="employee-no"
								placeholder="EMP-001"
								value={form.employeeNo}
								onChange={(event) =>
									setForm({ ...form, employeeNo: event.target.value })
								}
								required
							/>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="employee-position">Position</Label>
							<Input
								id="employee-position"
								placeholder="Designer"
								value={form.position}
								onChange={(event) =>
									setForm({ ...form, position: event.target.value })
								}
							/>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="employee-shift">Shift</Label>
							<Select
								value={form.shift}
								onValueChange={(value) => setForm({ ...form, shift: value })}
							>
								<SelectTrigger id="employee-shift" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										<SelectItem value="normal">Normal</SelectItem>
										<SelectItem value="flexi">Flexi</SelectItem>
									</SelectGroup>
								</SelectContent>
							</Select>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="employee-joined">Joined date</Label>
							<Input
								id="employee-joined"
								type="date"
								value={form.joinedAt}
								onChange={(event) =>
									setForm({ ...form, joinedAt: event.target.value })
								}
							/>
						</div>
						{editing ? (
							<div className="flex flex-col gap-2">
								<Label htmlFor="employee-supervisor">Supervisor</Label>
								<Select
									value={form.supervisorId}
									onValueChange={(value) =>
										setForm({ ...form, supervisorId: value })
									}
								>
									<SelectTrigger id="employee-supervisor" className="w-full">
										<SelectValue placeholder="None" />
									</SelectTrigger>
									<SelectContent>
										<SelectGroup>
											<SelectItem value="none">— No supervisor —</SelectItem>
											{supervisorOptions.map((candidate) => (
												<SelectItem key={candidate.id} value={candidate.id}>
													{candidate.name} ({candidate.employeeNo})
												</SelectItem>
											))}
										</SelectGroup>
									</SelectContent>
								</Select>
							</div>
						) : null}
						<div className="flex flex-col gap-2">
							<Label htmlFor="employee-site">Work location</Label>
							<Select
								value={form.siteId}
								onValueChange={(value) => setForm({ ...form, siteId: value })}
							>
								<SelectTrigger id="employee-site" className="w-full">
									<SelectValue placeholder="None" />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										<SelectItem value="none">— No site —</SelectItem>
										{sites.map((site) => (
											<SelectItem key={site.id} value={site.id}>
												{site.name}
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
						</div>
						{linkable.length > 0 ? (
							<div className="flex flex-col gap-2">
								<Label htmlFor="employee-link">Link member account (optional)</Label>
								<Select value={linkTarget} onValueChange={setLinkTarget}>
									<SelectTrigger id="employee-link" className="w-full">
										<SelectValue
											placeholder={
												editing?.linkedEmail
													? editing.linkedEmail
													: "Select a member to link"
											}
										/>
									</SelectTrigger>
									<SelectContent>
										<SelectGroup>
											{linkable.map((member) => (
												<SelectItem key={member.userId} value={member.userId}>
													{member.name} ({member.email})
												</SelectItem>
											))}
										</SelectGroup>
									</SelectContent>
								</Select>
								<p className="text-xs text-muted-foreground">
									Skip to key in without an account — can be linked later.
								</p>
							</div>
						) : null}
					</div>
					<DialogFooter>
						<Button type="submit" disabled={saveMutation.isPending}>
							{saveMutation.isPending
								? "Saving..."
								: editing
									? "Save changes"
									: "Add employee"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
