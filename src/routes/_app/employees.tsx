import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
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
import { getSession } from "#/lib/auth.functions";
import {
	createEmployee,
	linkEmployee,
	listEmployees,
	listLinkableMembers,
	setEmployeeActive,
	updateEmployee,
} from "#/lib/employees.functions";
import { getMyOrgRole } from "#/lib/org.functions";

export const Route = createFileRoute("/_app/employees")({
	staticData: { title: "Employees" },
	beforeLoad: async () => {
		const session = await getSession();
		if (!session) {
			throw redirect({ to: "/login" });
		}
		if (!session.session.activeOrganizationId) {
			throw redirect({ to: "/onboarding" });
		}
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
};

function EmployeesPage() {
	const router = useRouter();
	const [employees, setEmployees] = useState<EmployeeRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [sorting, setSorting] = useState([{ id: "employeeNo", desc: false }]);
	const [formOpen, setFormOpen] = useState(false);
	const [editing, setEditing] = useState<EmployeeRow | null>(null);

	const loadEmployees = useCallback(async () => {
		setLoading(true);
		const rows = await listEmployees();
		setEmployees(rows as EmployeeRow[]);
		setLoading(false);
	}, []);

	useEffect(() => {
		loadEmployees();
	}, [loadEmployees]);

	function openAdd() {
		setEditing(null);
		setFormOpen(true);
	}

	function openEdit(employee: EmployeeRow) {
		setEditing(employee);
		setFormOpen(true);
	}

	async function handleSaved() {
		setFormOpen(false);
		toast.success(editing ? "Employee updated" : "Employee added");
		await loadEmployees();
		await router.invalidate();
	}

	async function handleToggleActive(employee: EmployeeRow) {
		const result = await setEmployeeActive({
			data: { employeeId: employee.id, isActive: !employee.isActive },
		});
		if (!result.ok) {
			toast.error(result.reason);
			return;
		}
		toast.success(
			employee.isActive
				? `${employee.name} deactivated`
				: `${employee.name} activated`,
		);
		await loadEmployees();
	}

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
		[],
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
						loading={loading}
						columnCount={columns.length}
						toolbar={
							<Button size="sm" onClick={openAdd}>
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
				onOpenChange={(open) => {
					if (!open) {
						setFormOpen(false);
						setEditing(null);
					}
				}}
				onSaved={handleSaved}
			/>
		</div>
	);
}

function EmployeeFormDialog({
	open,
	editing,
	employees,
	onOpenChange,
	onSaved,
}: {
	open: boolean;
	editing: EmployeeRow | null;
	employees: EmployeeRow[];
	onOpenChange: (open: boolean) => void;
	onSaved: () => Promise<void>;
}) {
	const [form, setForm] = useState<EmployeeForm>({
		name: "",
		employeeNo: "",
		position: "",
		shift: "normal",
		joinedAt: "",
		supervisorId: "",
	});
	const [linkable, setLinkable] = useState<
		{ userId: string; name: string; email: string }[]
	>([]);
	const [linkTarget, setLinkTarget] = useState<string>("");
	const [pending, setPending] = useState(false);

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
					}
				: {
						name: "",
						employeeNo: "",
						position: "",
						shift: "normal",
						joinedAt: "",
						supervisorId: "",
					},
		);
		setLinkTarget("");
		if (editing) {
			listLinkableMembers()
				.then(setLinkable)
				.catch(() => setLinkable([]));
		}
	}, [open, editing]);

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setPending(true);
		const result = editing
			? await updateEmployee({
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
					},
				})
			: await createEmployee({
					data: {
						name: form.name,
						employeeNo: form.employeeNo,
						position: form.position,
						shift: form.shift,
						joinedAt: form.joinedAt || undefined,
					},
				});
		setPending(false);

		if (!result.ok) {
			toast.error(result.reason);
			return;
		}
		if (editing && linkTarget) {
			const linkResult = await linkEmployee({
				data: { employeeId: editing.id, targetUserId: linkTarget },
			});
			if (!linkResult.ok) {
				toast.error(linkResult.reason);
				return;
			}
			toast.success("Member linked to employee");
		}
		await onSaved();
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
						{editing ? (
							<div className="flex flex-col gap-2">
								<Label htmlFor="employee-link">Link member account</Label>
								<Select value={linkTarget} onValueChange={setLinkTarget}>
									<SelectTrigger id="employee-link" className="w-full">
										<SelectValue
											placeholder={
												editing.linkedEmail
													? editing.linkedEmail
													: "Select a member"
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
							</div>
						) : null}
					</div>
					<DialogFooter>
						<Button type="submit" disabled={pending}>
							{pending
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
