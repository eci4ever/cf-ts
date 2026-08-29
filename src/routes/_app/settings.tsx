import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { AlertTriangle, Crown, Settings as SettingsIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "#/components/ui/alert-dialog";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
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
	createLeaveType,
	deleteLeaveType,
	listLeaveTypes,
	updateLeaveType,
} from "#/lib/leave.functions";
import { getMyOrgRole } from "#/lib/org.functions";
import {
	deleteCurrentOrg,
	getOrgSettings,
	transferOwnership,
	updateOrgName,
	updateSchedule,
} from "#/lib/org-settings.functions";

export const Route = createFileRoute("/_app/settings")({
	staticData: { title: "Settings" },
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
	component: SettingsPage,
});

type MemberRow = {
	userId: string;
	name: string;
	email: string;
	role: string;
	joinedAt: Date;
};

function SettingsPage() {
	const router = useRouter();
	const queryClient = useQueryClient();
	const settingsQuery = useQuery({
		queryKey: ["org", "settings"],
		queryFn: getOrgSettings,
	});

	if (settingsQuery.isError) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Something went wrong</CardTitle>
					<CardDescription>
						Could not load organization settings.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Button
						variant="outline"
						onClick={() => queryClient.invalidateQueries({ queryKey: ["org"] })}
					>
						Try again
					</Button>
				</CardContent>
			</Card>
		);
	}
	if (settingsQuery.isPending || !settingsQuery.data) {
		return <p className="text-sm text-muted-foreground">Loading settings…</p>;
	}
	const settings = settingsQuery.data;

	return (
		<div className="flex flex-col gap-4">
			<GeneralCard
				name={settings.name}
				slug={settings.slug}
				onSaved={() => queryClient.invalidateQueries({ queryKey: ["org"] })}
			/>
			<ScheduleCard
				schedule={settings.schedule}
				onSaved={() => queryClient.invalidateQueries({ queryKey: ["org"] })}
			/>
			<LeaveTypesCard />
			{isOwner(settings.role) ? (
				<>
					<TransferOwnershipCard
						currentUserId={settings.currentUserId}
						members={settings.members}
						onDone={async () => {
							await router.invalidate();
							queryClient.invalidateQueries({ queryKey: ["org"] });
						}}
					/>
					<DangerZoneCard
						orgName={settings.name}
						onDeleted={async () => {
							toast.success("Organization deleted");
							await router.invalidate();
							await router.navigate({ to: "/onboarding" });
						}}
					/>
				</>
			) : (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-base">
							<AlertTriangle />
							Ownership actions
						</CardTitle>
						<CardDescription>
							Transferring ownership and deleting the organization can only be
							performed by the owner.
						</CardDescription>
					</CardHeader>
				</Card>
			)}
		</div>
	);
}

function isOwner(role: string): boolean {
	return role === "owner";
}

type ScheduleData = {
	workDays: number[];
	workStartMinutes: number;
	workEndMinutes: number;
	graceMinutes: number;
	timezone: string;
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function ScheduleCard({
	schedule,
	onSaved,
}: {
	schedule: ScheduleData;
	onSaved: () => void;
}) {
	const queryClient = useQueryClient();
	const [days, setDays] = useState<number[]>(schedule.workDays);
	const [startTime, setStartTime] = useState(
		`${String(Math.floor(schedule.workStartMinutes / 60)).padStart(2, "0")}:${String(schedule.workStartMinutes % 60).padStart(2, "0")}`,
	);
	const [endTime, setEndTime] = useState(
		`${String(Math.floor(schedule.workEndMinutes / 60)).padStart(2, "0")}:${String(schedule.workEndMinutes % 60).padStart(2, "0")}`,
	);
	const [grace, setGrace] = useState(String(schedule.graceMinutes));
	const [timezone, setTimezone] = useState(schedule.timezone);
	const scheduleMutation = useMutation({
		mutationFn: async (input: {
			workDays: number[];
			startTime: string;
			endTime: string;
			graceMinutes: number;
			timezone: string;
		}) => {
			const result = await updateSchedule({ data: input });
			if (!result.ok) {
				throw new Error(result.reason);
			}
			return result;
		},
		onSuccess: () => {
			toast.success("Work schedule updated");
			queryClient.invalidateQueries({ queryKey: ["org"] });
			onSaved();
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});

	function toggleDay(day: number) {
		setDays((previous) =>
			previous.includes(day)
				? previous.filter((value) => value !== day)
				: [...previous, day].sort(),
		);
	}

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		scheduleMutation.mutate({
			workDays: days,
			startTime,
			endTime,
			graceMinutes: Number(grace),
			timezone,
		});
	}

	const flexiHours = (
		Math.round(
			((schedule.workEndMinutes - schedule.workStartMinutes) / 60) * 10,
		) / 10
	).toString();

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<SettingsIcon />
					Work schedule
				</CardTitle>
				<CardDescription>
					Applies to the whole organization. Normal shift is late after{" "}
					{startTime} + grace; Flexi is late after {startTime} sharp and targets{" "}
					{flexiHours} hours from clock-in.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form onSubmit={handleSubmit} className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<Label>Work days</Label>
						<div className="flex flex-wrap gap-2">
							{DAY_LABELS.map((label, index) => (
								<Button
									key={label}
									type="button"
									variant={days.includes(index) ? "default" : "outline"}
									size="sm"
									onClick={() => toggleDay(index)}
								>
									{label}
								</Button>
							))}
						</div>
					</div>
					<div className="grid gap-4 sm:grid-cols-4">
						<div className="flex flex-col gap-2">
							<Label htmlFor="schedule-start">Start time</Label>
							<Input
								id="schedule-start"
								type="time"
								value={startTime}
								onChange={(event) => setStartTime(event.target.value)}
								required
							/>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="schedule-end">End time</Label>
							<Input
								id="schedule-end"
								type="time"
								value={endTime}
								onChange={(event) => setEndTime(event.target.value)}
								required
							/>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="schedule-grace">Grace (minutes)</Label>
							<Input
								id="schedule-grace"
								type="number"
								min={0}
								max={240}
								value={grace}
								onChange={(event) => setGrace(event.target.value)}
								required
							/>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="schedule-timezone">Timezone</Label>
							<Input
								id="schedule-timezone"
								value={timezone}
								onChange={(event) => setTimezone(event.target.value)}
								required
							/>
						</div>
					</div>
					<Button
						type="submit"
						disabled={scheduleMutation.isPending}
						className="w-fit"
					>
						{scheduleMutation.isPending ? "Saving..." : "Save schedule"}
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}

function GeneralCard({
	name,
	slug,
	onSaved,
}: {
	name: string;
	slug: string;
	onSaved: () => void;
}) {
	const queryClient = useQueryClient();
	const [value, setValue] = useState(name);
	const nameMutation = useMutation({
		mutationFn: async (input: { name: string }) => {
			const result = await updateOrgName({ data: input });
			if (!result.ok) {
				throw new Error(result.reason);
			}
			return result;
		},
		onSuccess: () => {
			toast.success("Organization name updated");
			queryClient.invalidateQueries({ queryKey: ["org"] });
			onSaved();
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});

	useEffect(() => {
		setValue(name);
	}, [name]);

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		nameMutation.mutate({ name: value });
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<SettingsIcon />
					General
				</CardTitle>
				<CardDescription>Organization identity details</CardDescription>
			</CardHeader>
			<CardContent>
				<form onSubmit={handleSubmit} className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<Label htmlFor="org-name">Organization name</Label>
						<Input
							id="org-name"
							value={value}
							onChange={(event) => setValue(event.target.value)}
							required
							minLength={2}
							maxLength={80}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label>Slug</Label>
						<p className="text-sm text-muted-foreground">{slug}</p>
					</div>
					<Button
						type="submit"
						disabled={nameMutation.isPending}
						className="w-fit"
					>
						{nameMutation.isPending ? "Saving..." : "Save changes"}
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}

function TransferOwnershipCard({
	currentUserId,
	members,
	onDone,
}: {
	currentUserId: string;
	members: MemberRow[];
	onDone: () => Promise<void>;
}) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const [target, setTarget] = useState<string>("");
	const [confirmOpen, setConfirmOpen] = useState(false);
	const transferMutation = useMutation({
		mutationFn: async (targetUserId: string) => {
			const result = await transferOwnership({ data: { targetUserId } });
			if (!result.ok) {
				throw new Error(result.reason);
			}
			return result;
		},
		onSuccess: async () => {
			toast.success("Ownership transferred — you are now an admin");
			setTarget("");
			setConfirmOpen(false);
			await router.invalidate();
			queryClient.invalidateQueries({ queryKey: ["org"] });
			onDone();
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});
	const candidates = members.filter(
		(member) => member.userId !== currentUserId && member.role !== "owner",
	);

	function handleTransfer() {
		if (!target) {
			return;
		}
		transferMutation.mutate(target);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Crown />
					Transfer ownership
				</CardTitle>
				<CardDescription>
					You will become an admin and the selected member becomes the owner
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="flex flex-col gap-4 sm:flex-row sm:items-end">
					<div className="flex flex-1 flex-col gap-2">
						<Label htmlFor="transfer-target">New owner</Label>
						<Select value={target} onValueChange={setTarget}>
							<SelectTrigger id="transfer-target" className="w-full">
								<SelectValue placeholder="Select a member" />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									{candidates.map((member) => (
										<SelectItem key={member.userId} value={member.userId}>
											{member.name} ({member.email}) — {member.role}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
					</div>
					<AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
						<AlertDialogTrigger asChild>
							<Button
								variant="outline"
								disabled={!target || candidates.length === 0}
							>
								Transfer ownership
							</Button>
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>Transfer ownership?</AlertDialogTitle>
								<AlertDialogDescription>
									You will lose owner privileges and become an admin. This can
									only be undone by the new owner.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>Cancel</AlertDialogCancel>
								<AlertDialogAction asChild>
									<Button
										onClick={handleTransfer}
										disabled={transferMutation.isPending}
									>
										{transferMutation.isPending
											? "Transferring..."
											: "Transfer"}
									</Button>
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</div>
				{candidates.length === 0 ? (
					<p className="mt-3 text-sm text-muted-foreground">
						No other members available. Invite teammates first.
					</p>
				) : null}
			</CardContent>
		</Card>
	);
}

function DangerZoneCard({
	orgName,
	onDeleted,
}: {
	orgName: string;
	onDeleted: () => Promise<void>;
}) {
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [confirmation, setConfirmation] = useState("");
	const deleteMutation = useMutation({
		mutationFn: async () => {
			const result = await deleteCurrentOrg();
			if (!result.ok) {
				throw new Error("Failed to delete organization");
			}
			return result;
		},
		onSuccess: () => {
			setConfirmOpen(false);
			onDeleted();
		},
		onError: () => {
			toast.error("Failed to delete organization");
		},
	});

	function handleDelete() {
		if (confirmation !== orgName) {
			toast.error(`Type "${orgName}" exactly to confirm deletion`);
			return;
		}
		deleteMutation.mutate();
	}

	return (
		<Card className="border-destructive/50">
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-destructive">
					<AlertTriangle />
					Danger zone
				</CardTitle>
				<CardDescription>
					Deleting the organization removes all members, invitations, credit
					history and subscription data — permanently. Members with an active
					session are returned to onboarding.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
					<AlertDialogTrigger asChild>
						<Button variant="destructive">Delete organization</Button>
					</AlertDialogTrigger>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Delete {orgName} permanently?</AlertDialogTitle>
							<AlertDialogDescription>
								This cannot be undone. Type the organization name{" "}
								<strong>{orgName}</strong> to confirm.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<div className="flex flex-col gap-2">
							<Label htmlFor="delete-confirmation">Organization name</Label>
							<Input
								id="delete-confirmation"
								value={confirmation}
								onChange={(event) => setConfirmation(event.target.value)}
								placeholder={orgName}
							/>
						</div>
						<AlertDialogFooter>
							<AlertDialogCancel
								onClick={() => {
									setConfirmation("");
								}}
							>
								Cancel
							</AlertDialogCancel>
							<AlertDialogAction asChild>
								<Button
									variant="destructive"
									disabled={
										deleteMutation.isPending || confirmation !== orgName
									}
									onClick={handleDelete}
								>
									{deleteMutation.isPending
										? "Deleting..."
										: "Delete permanently"}
								</Button>
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</CardContent>
		</Card>
	);
}

type LeaveTypeRow = {
	id: string;
	name: string;
	quotaDays: number | null;
};

function LeaveTypesCard() {
	const queryClient = useQueryClient();
	const [name, setName] = useState("");
	const [quota, setQuota] = useState("");
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editName, setEditName] = useState("");
	const [editQuota, setEditQuota] = useState("");
	const typesQuery = useQuery({
		queryKey: ["leave", "types"],
		queryFn: listLeaveTypes,
	});
	const types = (typesQuery.data ?? []) as LeaveTypeRow[];
	const createMutation = useMutation({
		mutationFn: async (input: { name: string; quotaDays: number | null }) => {
			const result = await createLeaveType({ data: input });
			if (!result.ok) {
				throw new Error(result.reason);
			}
			return result;
		},
		onSuccess: (_result, variables) => {
			toast.success(`Leave type "${variables.name}" created`);
			setName("");
			setQuota("");
			queryClient.invalidateQueries({ queryKey: ["leave", "types"] });
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});
	const updateMutation = useMutation({
		mutationFn: async (input: {
			leaveTypeId: string;
			name: string;
			quotaDays: number | null;
		}) => {
			const result = await updateLeaveType({ data: input });
			if (!result.ok) {
				throw new Error(result.reason);
			}
			return result;
		},
		onSuccess: () => {
			toast.success("Leave type updated");
			setEditingId(null);
			queryClient.invalidateQueries({ queryKey: ["leave", "types"] });
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});
	const deleteMutation = useMutation({
		mutationFn: async (leaveTypeId: string) => {
			const result = await deleteLeaveType({ data: { leaveTypeId } });
			if (!result.ok) {
				throw new Error(result.reason);
			}
			return result;
		},
		onSuccess: () => {
			toast.success("Leave type deleted");
			queryClient.invalidateQueries({ queryKey: ["leave", "types"] });
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});

	function handleCreate(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		createMutation.mutate({ name, quotaDays: quota ? Number(quota) : null });
	}

	function handleUpdate(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!editingId) {
			return;
		}
		updateMutation.mutate({
			leaveTypeId: editingId,
			name: editName,
			quotaDays: editQuota ? Number(editQuota) : null,
		});
	}

	function handleDelete(leaveTypeId: string) {
		deleteMutation.mutate(leaveTypeId);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<SettingsIcon />
					Leave types
				</CardTitle>
				<CardDescription>
					Quota is per calendar year and applies to all employees. Leave empty
					for unlimited.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{typesQuery.isPending ? (
					<p className="text-sm text-muted-foreground">Loading…</p>
				) : (
					<div className="flex flex-col gap-2">
						{types.map((type) =>
							editingId === type.id ? (
								<form
									key={type.id}
									onSubmit={handleUpdate}
									className="flex flex-wrap items-end gap-2"
								>
									<Input
										value={editName}
										onChange={(event) => setEditName(event.target.value)}
										className="w-40"
										required
									/>
									<Input
										value={editQuota}
										onChange={(event) => setEditQuota(event.target.value)}
										placeholder="Days (empty = unlimited)"
										className="w-56"
									/>
									<Button
										type="submit"
										size="sm"
										disabled={createMutation.isPending}
									>
										Save
									</Button>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										onClick={() => setEditingId(null)}
									>
										Cancel
									</Button>
								</form>
							) : (
								<div
									key={type.id}
									className="flex items-center justify-between gap-2 rounded-lg border p-3"
								>
									<div>
										<p className="text-sm font-medium">{type.name}</p>
										<p className="text-xs text-muted-foreground">
											{type.quotaDays === null
												? "Unlimited"
												: `${type.quotaDays} days / year`}
										</p>
									</div>
									<div className="flex gap-1">
										<Button
											variant="ghost"
											size="sm"
											onClick={() => {
												setEditingId(type.id);
												setEditName(type.name);
												setEditQuota(
													type.quotaDays === null ? "" : String(type.quotaDays),
												);
											}}
										>
											Edit
										</Button>
										<Button
											variant="ghost"
											size="sm"
											onClick={() => handleDelete(type.id)}
										>
											Delete
										</Button>
									</div>
								</div>
							),
						)}
					</div>
				)}
				<form
					onSubmit={handleCreate}
					className="flex flex-wrap items-end gap-2 border-t pt-4"
				>
					<div className="flex flex-col gap-2">
						<Label htmlFor="leave-type-name">New leave type</Label>
						<Input
							id="leave-type-name"
							placeholder="Emergency"
							value={name}
							onChange={(event) => setName(event.target.value)}
							required
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="leave-type-quota">Days / year</Label>
						<Input
							id="leave-type-quota"
							placeholder="Empty = unlimited"
							value={quota}
							onChange={(event) => setQuota(event.target.value)}
						/>
					</div>
					<Button type="submit" disabled={createMutation.isPending}>
						{createMutation.isPending ? "Adding…" : "Add type"}
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}
