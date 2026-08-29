import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarPlus, Check, X } from "lucide-react";
import { useState } from "react";
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
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { Textarea } from "#/components/ui/textarea";
import {
	applyLeave,
	cancelLeave,
	decideLeave,
	getLeaveOverview,
	listApprovals,
} from "#/lib/leave.functions";

export const Route = createFileRoute("/_app/leave")({
	staticData: { title: "Leave" },
	component: LeavePage,
});

type Balance = {
	id: string;
	name: string;
	quotaDays: number | null;
	usedDays: number;
	remainingDays: number | null;
};

type LeaveRequestRow = {
	id: string;
	leaveTypeName: string;
	startDate: string;
	endDate: string;
	days: number;
	reason: string;
	status: string;
	decisionReason: string | null;
	createdAt: Date;
};

type ApprovalRow = {
	id: string;
	employeeName: string;
	employeeNo: string;
	leaveTypeName: string;
	startDate: string;
	endDate: string;
	days: number;
	reason: string;
};

function LeavePage() {
	return (
		<Tabs defaultValue="mine" className="gap-4">
			<TabsList>
				<TabsTrigger value="mine">My leave</TabsTrigger>
				<TabsTrigger value="approvals">Approvals</TabsTrigger>
			</TabsList>
			<TabsContent value="mine">
				<MyLeaveTab />
			</TabsContent>
			<TabsContent value="approvals">
				<ApprovalsTab />
			</TabsContent>
		</Tabs>
	);
}

function MyLeaveTab() {
	const [applyOpen, setApplyOpen] = useState(false);
	const overviewQuery = useQuery({
		queryKey: ["leave", "overview"],
		queryFn: getLeaveOverview,
	});

	if (overviewQuery.isError) {
		return (
			<LoadError
				message="Could not load your leave overview."
				onRetry={() => overviewQuery.refetch()}
			/>
		);
	}
	if (overviewQuery.isPending || !overviewQuery.data) {
		return <p className="text-sm text-muted-foreground">Loading…</p>;
	}
	const overview = {
		balances: overviewQuery.data.balances as Balance[],
		requests: overviewQuery.data.requests as LeaveRequestRow[],
		canApply: overviewQuery.data.canApply,
	};

	return (
		<div className="flex flex-col gap-4">
			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
				{overview.balances.map((balance) => (
					<Card key={balance.id}>
						<CardHeader className="flex-row items-center justify-between space-y-0">
							<CardDescription>{balance.name}</CardDescription>
							<Badge variant="secondary">
								{balance.quotaDays === null
									? "Unlimited"
									: `${balance.remainingDays}/${balance.quotaDays} left`}
							</Badge>
						</CardHeader>
						<CardContent>
							<CardTitle className="text-2xl">
								{balance.usedDays}{" "}
								<span className="text-sm font-normal text-muted-foreground">
									days used this year
								</span>
							</CardTitle>
						</CardContent>
					</Card>
				))}
			</div>

			<Card>
				<CardHeader>
					<CardTitle>My requests</CardTitle>
					<CardDescription>
						{overview.canApply
							? "Pending requests reserve your balance until decided."
							: "Your account is not linked to an employee record — an admin can apply on your behalf."}
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					<div>
						<Button
							size="sm"
							disabled={!overview.canApply}
							onClick={() => setApplyOpen(true)}
						>
							<CalendarPlus />
							Apply for leave
						</Button>
					</div>
					{overview.requests.length === 0 ? (
						<p className="text-sm text-muted-foreground">No requests yet.</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Type</TableHead>
									<TableHead>Dates</TableHead>
									<TableHead>Days</TableHead>
									<TableHead>Status</TableHead>
									<TableHead className="w-12" />
								</TableRow>
							</TableHeader>
							<TableBody>
								{overview.requests.map((request) => (
									<TableRow key={request.id}>
										<TableCell className="font-medium">
											{request.leaveTypeName}
										</TableCell>
										<TableCell>
											{request.startDate} → {request.endDate}
										</TableCell>
										<TableCell>{request.days}</TableCell>
										<TableCell>
											<StatusBadge status={request.status} />
											{request.decisionReason ? (
												<p className="mt-1 text-xs text-muted-foreground">
													{request.decisionReason}
												</p>
											) : null}
										</TableCell>
										<TableCell>
											{request.status === "pending" ? (
												<CancelButton requestId={request.id} />
											) : null}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>

			<ApplyDialog
				open={applyOpen}
				balances={overview.balances}
				onOpenChange={(open) => {
					if (!open) {
						setApplyOpen(false);
					}
				}}
				onSaved={() => {
					setApplyOpen(false);
					toast.success("Leave request submitted");
				}}
			/>
		</div>
	);
}

function StatusBadge({ status }: { status: string }) {
	const variant =
		status === "approved"
			? "secondary"
			: status === "rejected" || status === "cancelled"
				? "destructive"
				: "outline";
	return <Badge variant={variant}>{status}</Badge>;
}

function LoadError({
	message,
	onRetry,
}: {
	message: string;
	onRetry: () => void;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Something went wrong</CardTitle>
				<CardDescription>{message}</CardDescription>
			</CardHeader>
			<CardContent>
				<Button variant="outline" onClick={onRetry}>
					Try again
				</Button>
			</CardContent>
		</Card>
	);
}

function CancelButton({ requestId }: { requestId: string }) {
	const [open, setOpen] = useState(false);
	const queryClient = useQueryClient();
	const cancelMutation = useMutation({
		mutationFn: (id: string) => cancelLeave({ data: { requestId: id } }),
		onSuccess: (result) => {
			if (!result.ok) {
				toast.error(result.reason);
				return;
			}
			toast.success("Request cancelled — balance restored");
			setOpen(false);
			queryClient.invalidateQueries({ queryKey: ["leave"] });
		},
	});

	return (
		<AlertDialog open={open} onOpenChange={setOpen}>
			<AlertDialogTrigger asChild>
				<Button variant="ghost" size="icon" aria-label="Cancel request">
					<X />
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Cancel this request?</AlertDialogTitle>
					<AlertDialogDescription>
						Reserved balance will be restored immediately.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Keep</AlertDialogCancel>
					<AlertDialogAction asChild>
						<Button
							variant="destructive"
							onClick={() => cancelMutation.mutate(requestId)}
							disabled={cancelMutation.isPending}
						>
							{cancelMutation.isPending ? "Cancelling…" : "Cancel request"}
						</Button>
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

function ApplyDialog({
	open,
	balances,
	onOpenChange,
	onSaved,
}: {
	open: boolean;
	balances: Balance[];
	onOpenChange: (open: boolean) => void;
	onSaved: () => void;
}) {
	const queryClient = useQueryClient();
	const [leaveTypeId, setLeaveTypeId] = useState("");
	const [startDate, setStartDate] = useState("");
	const [endDate, setEndDate] = useState("");
	const [reason, setReason] = useState("");
	const applyMutation = useMutation({
		mutationFn: async (input: {
			leaveTypeId: string;
			startDate: string;
			endDate: string;
			reason: string;
		}) => {
			const result = await applyLeave({ data: input });
			if (!result.ok) {
				throw new Error(result.reason);
			}
			return result;
		},
		onSuccess: (result) => {
			toast.success(
				`Request submitted — ${result.days} working day(s) reserved`,
			);
			setLeaveTypeId("");
			setStartDate("");
			setEndDate("");
			setReason("");
			queryClient.invalidateQueries({ queryKey: ["leave"] });
			onSaved();
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		applyMutation.mutate({ leaveTypeId, startDate, endDate, reason });
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Apply for leave</DialogTitle>
					<DialogDescription>
						Days are counted as working days in your organization schedule.
					</DialogDescription>
				</DialogHeader>
				<form
					onSubmit={(event) => {
						handleSubmit(event);
					}}
					className="flex flex-col gap-4"
				>
					<div className="flex flex-col gap-2">
						<Label htmlFor="apply-type">Leave type</Label>
						<Select value={leaveTypeId} onValueChange={setLeaveTypeId}>
							<SelectTrigger id="apply-type" className="w-full">
								<SelectValue placeholder="Select type" />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									{balances.map((balance) => (
										<SelectItem key={balance.id} value={balance.id}>
											{balance.name}
											{balance.remainingDays !== null
												? ` (${balance.remainingDays} left)`
												: ""}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
					</div>
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="flex flex-col gap-2">
							<Label htmlFor="apply-start">From</Label>
							<Input
								id="apply-start"
								type="date"
								value={startDate}
								onChange={(event) => setStartDate(event.target.value)}
								required
							/>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="apply-end">To</Label>
							<Input
								id="apply-end"
								type="date"
								value={endDate}
								onChange={(event) => setEndDate(event.target.value)}
								required
							/>
						</div>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="apply-reason">Reason</Label>
						<Textarea
							id="apply-reason"
							value={reason}
							onChange={(event) => setReason(event.target.value)}
							required
						/>
					</div>
					<DialogFooter>
						<Button
							type="submit"
							disabled={applyMutation.isPending || !leaveTypeId}
						>
							{applyMutation.isPending ? "Submitting…" : "Submit request"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function ApprovalsTab() {
	const queryClient = useQueryClient();
	const [rejectTarget, setRejectTarget] = useState<ApprovalRow | null>(null);
	const approvalsQuery = useQuery({
		queryKey: ["leave", "approvals"],
		queryFn: listApprovals,
	});
	const decideMutation = useMutation({
		mutationFn: async (input: {
			requestId: string;
			decision: "approved" | "rejected";
			reason?: string;
		}) => {
			const result = await decideLeave({ data: input });
			if (!result.ok) {
				throw new Error(result.reason);
			}
			return result;
		},
		onSuccess: (_result, variables) => {
			toast.success(`Request ${variables.decision}`);
			queryClient.invalidateQueries({ queryKey: ["leave"] });
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});

	function handleDecide(
		requestId: string,
		decision: "approved" | "rejected",
		reason?: string,
	) {
		decideMutation.mutate({ requestId, decision, reason });
	}

	if (approvalsQuery.isError) {
		return (
			<LoadError
				message="Could not load pending approvals."
				onRetry={() => approvalsQuery.refetch()}
			/>
		);
	}
	if (approvalsQuery.isPending || !approvalsQuery.data) {
		return <p className="text-sm text-muted-foreground">Loading…</p>;
	}
	const data = {
		requests: approvalsQuery.data.requests as ApprovalRow[],
		scope: approvalsQuery.data.scope,
	};

	if (data.scope === "none") {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Approvals</CardTitle>
					<CardDescription>
						Only supervisors and admins can approve leave requests.
					</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Pending leave requests</CardTitle>
				<CardDescription>
					{data.scope === "admin"
						? "All pending requests in your organization"
						: "Pending requests from your direct reports"}
				</CardDescription>
			</CardHeader>
			<CardContent>
				{data.requests.length === 0 ? (
					<p className="text-sm text-muted-foreground">No pending requests.</p>
				) : (
					<div className="flex flex-col gap-3">
						{data.requests.map((request) => (
							<div
								key={request.id}
								className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
							>
								<div className="min-w-0 flex-1">
									<p className="text-sm font-medium">
										{request.employeeName}{" "}
										<span className="text-xs text-muted-foreground">
											({request.employeeNo})
										</span>
									</p>
									<p className="text-sm text-muted-foreground">
										{request.leaveTypeName} · {request.startDate} →{" "}
										{request.endDate} · {request.days} working day(s)
									</p>
									<p className="mt-1 truncate text-xs text-muted-foreground">
										Reason: {request.reason}
									</p>
								</div>
								<div className="flex shrink-0 gap-2">
									<Button
										size="sm"
										onClick={() => handleDecide(request.id, "approved")}
									>
										<Check />
										Approve
									</Button>
									<Button
										size="sm"
										variant="outline"
										onClick={() => setRejectTarget(request)}
									>
										<X />
										Reject
									</Button>
								</div>
							</div>
						))}
					</div>
				)}
			</CardContent>
			<RejectDialog
				target={rejectTarget}
				onOpenChange={(open) => {
					if (!open) {
						setRejectTarget(null);
					}
				}}
				onConfirm={async (reason) => {
					if (rejectTarget) {
						await handleDecide(rejectTarget.id, "rejected", reason);
					}
					setRejectTarget(null);
				}}
			/>
		</Card>
	);
}

function RejectDialog({
	target,
	onOpenChange,
	onConfirm,
}: {
	target: ApprovalRow | null;
	onOpenChange: (open: boolean) => void;
	onConfirm: (reason: string) => Promise<void>;
}) {
	const [reason, setReason] = useState("");
	const [pending, setPending] = useState(false);

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setPending(true);
		await onConfirm(reason.trim());
		setPending(false);
		setReason("");
	}

	return (
		<AlertDialog
			open={target !== null}
			onOpenChange={(open) => {
				if (!open) {
					setReason("");
				}
				onOpenChange(open);
			}}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Reject request?</AlertDialogTitle>
					<AlertDialogDescription>
						{target
							? `${target.employeeName}'s ${target.leaveTypeName} leave (${target.startDate} → ${target.endDate})`
							: ""}{" "}
						will be rejected and the reserved balance restored.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<form onSubmit={handleSubmit} className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<Label htmlFor="reject-reason">Reason (optional)</Label>
						<Textarea
							id="reject-reason"
							value={reason}
							onChange={(event) => setReason(event.target.value)}
						/>
					</div>
					<AlertDialogFooter>
						<AlertDialogCancel>Back</AlertDialogCancel>
						<AlertDialogAction asChild>
							<Button type="submit" variant="destructive" disabled={pending}>
								{pending ? "Rejecting…" : "Reject request"}
							</Button>
						</AlertDialogAction>
					</AlertDialogFooter>
				</form>
			</AlertDialogContent>
		</AlertDialog>
	);
}
