import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import { Check, LogIn, LogOut, PlusSquare, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AttendanceHeatmap } from "#/components/attendance-heatmap";
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
	adminListAttendance,
	adminUpsertAttendance,
	clockIn,
	clockOut,
	getMyAttendanceHeatmap,
	getTodayAttendance,
	listIssuesForReview,
	listMyAttendance,
	listMyIssues,
	submitJustification,
	verifyIssue,
} from "#/lib/attendance.functions";
import { getPosition } from "#/lib/geolocation";
import {
	type ClockInStatus,
	type ClockOutStatus,
	formatMinutes,
	type Schedule,
	type Shift,
} from "#/lib/schedule";

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

export const Route = createFileRoute("/_app/attendance")({
	staticData: { title: "Attendance" },
	component: AttendancePage,
});

type AttendanceRecord = {
	id: string;
	employeeId: string;
	date: string;
	clockIn: Date;
	clockInStatus: ClockInStatus;
	clockOut: Date | null;
	clockOutStatus: ClockOutStatus;
	siteId: string | null;
	lat: number | null;
	lng: number | null;
	distanceM: number | null;
	locationStatus: string | null;
	clockOutLat: number | null;
	clockOutLng: number | null;
	clockOutDistanceM: number | null;
	clockOutLocationStatus: string | null;
	note: string | null;
};

type TodayData = {
	schedule: Schedule;
	employee: { id: string; name: string; shift: Shift } | null;
	today: string;
	record: AttendanceRecord | null;
	targetClockOut: Date | null;
};

function AttendancePage() {
	const { orgRole } = useRouteContext({ from: "/_app" });
	const canViewAll =
		orgRole === "admin" || orgRole === "owner" || orgRole === "supervisor";
	const canReview =
		orgRole === "admin" || orgRole === "owner" || orgRole === "supervisor";

	return (
		<Tabs defaultValue="me" className="gap-4">
			<TabsList>
				<TabsTrigger value="me">My attendance</TabsTrigger>
				{canViewAll ? (
					<TabsTrigger value="all">All attendance</TabsTrigger>
				) : null}
				<TabsTrigger value="issues">Issues</TabsTrigger>
			</TabsList>
			<TabsContent value="me">
				<MyAttendanceTab />
			</TabsContent>
			{canViewAll ? (
				<TabsContent value="all">
					<AllAttendanceTab />
				</TabsContent>
			) : null}
			<TabsContent value="issues">
				<IssuesTab canReview={canReview} />
			</TabsContent>
		</Tabs>
	);
}

function MyAttendanceTab() {
	const queryClient = useQueryClient();
	const [pending, setPending] = useState(false);
	const todayQuery = useQuery({
		queryKey: ["attendance", "today"],
		queryFn: getTodayAttendance,
	});
	const historyQuery = useQuery({
		queryKey: ["attendance", "history"],
		queryFn: listMyAttendance,
	});
	const heatmapQuery = useQuery({
		queryKey: ["attendance", "heatmap"],
		queryFn: getMyAttendanceHeatmap,
	});

	async function handleClockIn() {
		setPending(true);
		try {
			let coords: { latitude: number; longitude: number } | undefined;
			const geofence = todayQuery.data?.geofence;
			if (geofence?.geofenceEnabled) {
				if (geofence.blockedReason) {
					toast.error(geofence.blockedReason);
					return;
				}
				coords = await getPosition();
			}
			const result = await clockIn({ data: coords });
			if (!result.ok) {
				toast.error(result.reason);
				return;
			}
			toast.success(
				result.record.clockInStatus === "late"
					? "Clocked in (late)"
					: "Clocked in",
			);
			queryClient.invalidateQueries({ queryKey: ["attendance"] });
			queryClient.invalidateQueries({ queryKey: ["issues"] });
			queryClient.invalidateQueries({ queryKey: ["dashboard"] });
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Location is required to clock in",
			);
		} finally {
			setPending(false);
		}
	}

	async function handleClockOut() {
		setPending(true);
		try {
			let coords: { latitude: number; longitude: number } | undefined;
			const geofence = todayQuery.data?.geofence;
			if (geofence?.geofenceEnabled) {
				if (geofence.blockedReason) {
					toast.error(geofence.blockedReason);
					return;
				}
				coords = await getPosition();
			}
			const result = await clockOut({ data: coords });
			if (!result.ok) {
				toast.error(result.reason);
				return;
			}
			toast.success(
				result.status === "short"
					? "Clocked out — note: under target hours"
					: "Clocked out",
			);
			queryClient.invalidateQueries({ queryKey: ["attendance"] });
			queryClient.invalidateQueries({ queryKey: ["issues"] });
			queryClient.invalidateQueries({ queryKey: ["dashboard"] });
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Location is required to clock out",
			);
		} finally {
			setPending(false);
		}
	}

	if (todayQuery.isError || historyQuery.isError) {
		return (
			<LoadError
				message="Could not load your attendance."
				onRetry={() => {
					todayQuery.refetch();
					historyQuery.refetch();
				}}
			/>
		);
	}
	if (todayQuery.isPending || historyQuery.isPending || !todayQuery.data) {
		return <p className="text-sm text-muted-foreground">Loading…</p>;
	}
	const today: TodayData = {
		...todayQuery.data,
		record: (todayQuery.data.record as AttendanceRecord | null) ?? null,
	};
	const history = historyQuery.data as AttendanceRecord[];

	const record = today.record;
	const isClockedIn = record !== null && record.clockOut === null;

	return (
		<div className="flex flex-col gap-4">
			<Card>
				<CardHeader>
					<CardTitle>
						Today — {new Date(`${today.today}T00:00:00`).toLocaleDateString()}
					</CardTitle>
					<CardDescription>
						{today.employee ? (
							<>
								{today.employee.name} · {today.employee.shift} shift · work
								hours {formatMinutes(today.schedule.workStartMinutes)}–
								{formatMinutes(today.schedule.workEndMinutes)}
							</>
						) : (
							"Your account is not linked to an employee record — ask an admin to link you, or they can key in your attendance manually."
						)}
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-wrap items-center gap-4">
					{record ? (
						<>
							<div>
								<p className="text-xs text-muted-foreground">Clock in</p>
								<p className="flex items-center gap-2 text-lg font-semibold">
									{new Date(record.clockIn).toLocaleTimeString()}
									<ClockInBadge status={record.clockInStatus} />
								</p>
							</div>
							<div>
								<p className="text-xs text-muted-foreground">Clock out</p>
								<p className="flex items-center gap-2 text-lg font-semibold">
									{record.clockOut
										? new Date(record.clockOut).toLocaleTimeString()
										: "—"}
									{record.clockOutStatus ? (
										<ClockOutBadge status={record.clockOutStatus} />
									) : null}
								</p>
							</div>
							{isClockedIn && today.targetClockOut ? (
								<p className="text-sm text-muted-foreground">
									Target clock out: {today.targetClockOut.toLocaleTimeString()}
								</p>
							) : null}
						</>
					) : (
						<p className="text-sm text-muted-foreground">
							{today.employee
								? "You have not clocked in today."
								: "No record for today."}
						</p>
					)}
					<div className="ml-auto flex gap-2">
						<Button
							onClick={handleClockIn}
							disabled={pending || !today.employee || record !== null}
						>
							<LogIn />
							{pending ? "…" : "Clock in"}
						</Button>
						<Button
							variant="outline"
							onClick={handleClockOut}
							disabled={pending || !today.employee || !isClockedIn}
						>
							<LogOut />
							Clock out
						</Button>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Attendance heatmap</CardTitle>
					<CardDescription>Your last 12 weeks at a glance</CardDescription>
				</CardHeader>
				<CardContent>
					{heatmapQuery.isPending ? (
						<p className="text-sm text-muted-foreground">Loading…</p>
					) : (
						<AttendanceHeatmap days={heatmapQuery.data?.days ?? []} />
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>History</CardTitle>
					<CardDescription>Your last 30 attendance records</CardDescription>
				</CardHeader>
				<CardContent>
					{history.length === 0 ? (
						<p className="text-sm text-muted-foreground">No records yet.</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Date</TableHead>
									<TableHead>Clock in</TableHead>
									<TableHead>Clock out</TableHead>
									<TableHead>Location</TableHead>
									<TableHead>Note</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{history.map((entry) => (
									<TableRow key={entry.id}>
										<TableCell>{entry.date}</TableCell>
										<TableCell>
											<span className="flex items-center gap-2">
												{new Date(entry.clockIn).toLocaleTimeString()}
												<ClockInBadge status={entry.clockInStatus} />
											</span>
										</TableCell>
										<TableCell>
											<span className="flex items-center gap-2">
												{entry.clockOut
													? new Date(entry.clockOut).toLocaleTimeString()
													: "—"}
												{entry.clockOutStatus ? (
													<ClockOutBadge status={entry.clockOutStatus} />
												) : null}
											</span>
										</TableCell>
										<TableCell>
											<LocationCell record={entry} />
										</TableCell>
										<TableCell className="max-w-40 truncate text-muted-foreground">
											{entry.note ?? "—"}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

function ClockInBadge({ status }: { status: ClockInStatus }) {
	if (status === "manual") {
		return <Badge variant="outline">manual</Badge>;
	}
	return (
		<Badge variant={status === "late" ? "destructive" : "secondary"}>
			{status}
		</Badge>
	);
}

function ClockOutBadge({ status }: { status: ClockOutStatus }) {
	if (status === null) {
		return null;
	}
	if (status === "manual") {
		return <Badge variant="outline">manual</Badge>;
	}
	return (
		<Badge variant={status === "short" ? "destructive" : "secondary"}>
			{status}
		</Badge>
	);
}

function LocationCell({ record }: { record: AttendanceRecord | null }) {
	if (!record) {
		return <span className="text-muted-foreground">—</span>;
	}
	const badges = [];
	if (record.locationStatus) {
		badges.push(
			record.locationStatus === "outside" ? (
				<Badge key="in" variant="destructive">
					out {record.distanceM !== null ? `${record.distanceM}m` : ""}
				</Badge>
			) : record.locationStatus === "manual" ? null : (
				<Badge key="in" variant="secondary">
					inside
				</Badge>
			),
		);
	}
	if (record.clockOutLocationStatus) {
		badges.push(
			record.clockOutLocationStatus === "outside" ? (
				<Badge key="out" variant="destructive">
					out{" "}
					{record.clockOutDistanceM !== null
						? `${record.clockOutDistanceM}m`
						: ""}
				</Badge>
			) : (
				<Badge key="out" variant="secondary">
					inside
				</Badge>
			),
		);
	}
	if (badges.length === 0) {
		return record.clockInStatus === "manual" ? (
			<span className="text-xs text-muted-foreground">manual</span>
		) : (
			<span className="text-muted-foreground">—</span>
		);
	}
	return <span className="flex gap-1">{badges}</span>;
}

type AllAttendanceRow = {
	employee: { id: string; name: string; employeeNo: string; shift: string };
	record: AttendanceRecord | null;
};

function AllAttendanceTab() {
	const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
	const [editTarget, setEditTarget] = useState<AllAttendanceRow | null>(null);
	const listQuery = useQuery({
		queryKey: ["attendance", "all", date],
		queryFn: () => adminListAttendance({ data: { date } }),
	});
	const data = (listQuery.data?.rows ?? []) as AllAttendanceRow[];

	return (
		<div className="flex flex-col gap-4">
			<Card>
				<CardHeader>
					<CardTitle>All attendance</CardTitle>
					<CardDescription>
						Click a row to key in or correct attendance for that employee
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					<div className="flex items-center gap-2">
						<Label htmlFor="attendance-date">Date</Label>
						<Input
							id="attendance-date"
							type="date"
							value={date}
							onChange={(event) => setDate(event.target.value)}
							className="w-40"
						/>
					</div>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="sticky left-0 z-10 bg-card">
									Employee
								</TableHead>
								<TableHead>Shift</TableHead>
								<TableHead>Clock in</TableHead>
								<TableHead>Clock out</TableHead>
								<TableHead>Location</TableHead>
								<TableHead>Note</TableHead>
								<TableHead className="w-12" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{listQuery.isError ? (
								<TableRow>
									<TableCell colSpan={7} className="text-destructive">
										Failed to load attendance.
									</TableCell>
								</TableRow>
							) : listQuery.isPending ? (
								<TableRow>
									<TableCell colSpan={7}>Loading…</TableCell>
								</TableRow>
							) : (
								data.map((row) => (
									<TableRow
										key={row.employee.id}
										className="cursor-pointer"
										onClick={() => setEditTarget(row)}
									>
										<TableCell className="sticky left-0 z-10 bg-card [tr:hover_&]:bg-muted/50">
											<span className="font-medium">{row.employee.name}</span>
											<span className="ml-2 text-xs text-muted-foreground">
												{row.employee.employeeNo}
											</span>
										</TableCell>
										<TableCell>
											<Badge variant="secondary">{row.employee.shift}</Badge>
										</TableCell>
										<TableCell>
											{row.record ? (
												<span className="flex items-center gap-2">
													{new Date(row.record.clockIn).toLocaleTimeString()}
													<ClockInBadge status={row.record.clockInStatus} />
												</span>
											) : (
												<span className="text-muted-foreground">—</span>
											)}
										</TableCell>
										<TableCell>
											{row.record?.clockOut ? (
												<span className="flex items-center gap-2">
													{new Date(row.record.clockOut).toLocaleTimeString()}
													{row.record.clockOutStatus ? (
														<ClockOutBadge status={row.record.clockOutStatus} />
													) : null}
												</span>
											) : row.record ? (
												<Badge variant="outline">open</Badge>
											) : (
												<span className="text-muted-foreground">—</span>
											)}
										</TableCell>
										<TableCell>
											<LocationCell record={row.record} />
										</TableCell>
										<TableCell className="max-w-40 truncate text-muted-foreground">
											{row.record?.note ?? "—"}
										</TableCell>
										<TableCell>
											<PlusSquare />
										</TableCell>
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
				</CardContent>
			</Card>
			<AttendanceEntryDialog
				target={editTarget}
				date={date}
				onOpenChange={(open) => {
					if (!open) {
						setEditTarget(null);
					}
				}}
				onSaved={() => {}}
			/>
		</div>
	);
}

function AttendanceEntryDialog({
	target,
	date,
	onOpenChange,
	onSaved,
}: {
	target: AllAttendanceRow | null;
	date: string;
	onOpenChange: (open: boolean) => void;
	onSaved: () => void;
}) {
	const queryClient = useQueryClient();
	const [clockInTime, setClockInTime] = useState("09:00");
	const [clockOutTime, setClockOutTime] = useState("");
	const [note, setNote] = useState("");
	const upsertMutation = useMutation({
		mutationFn: async (input: {
			employeeId: string;
			date: string;
			clockInTime: string;
			clockOutTime?: string;
			note: string;
		}) => {
			const result = await adminUpsertAttendance({ data: input });
			if (!result.ok) {
				throw new Error(result.reason);
			}
			return result;
		},
		onSuccess: (result) => {
			toast.success(
				result.updated ? "Attendance corrected" : "Attendance recorded",
			);
			onOpenChange(false);
			queryClient.invalidateQueries({ queryKey: ["attendance"] });
			queryClient.invalidateQueries({ queryKey: ["issues"] });
			onSaved();
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});

	useEffect(() => {
		if (!target) {
			return;
		}
		const record = target.record;
		setClockInTime(
			record
				? new Date(record.clockIn).toLocaleTimeString("en-GB", {
						hour: "2-digit",
						minute: "2-digit",
					})
				: "09:00",
		);
		setClockOutTime(
			record?.clockOut
				? new Date(record.clockOut).toLocaleTimeString("en-GB", {
						hour: "2-digit",
						minute: "2-digit",
					})
				: "",
		);
		setNote(record?.note ?? "");
	}, [target]);

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!target) {
			return;
		}
		upsertMutation.mutate({
			employeeId: target.employee.id,
			date,
			clockInTime,
			clockOutTime: clockOutTime || undefined,
			note,
		});
	}

	return (
		<Dialog open={target !== null} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Attendance — {target?.employee.name ?? ""}</DialogTitle>
					<DialogDescription>
						{date} · times are in the organization timezone; statuses are
						computed automatically
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={handleSubmit} className="flex flex-col gap-4">
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="flex flex-col gap-2">
							<Label htmlFor="entry-clock-in">Clock in (HH:MM)</Label>
							<Input
								id="entry-clock-in"
								placeholder="09:00"
								value={clockInTime}
								onChange={(event) => setClockInTime(event.target.value)}
								required
							/>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="entry-clock-out">Clock out (HH:MM)</Label>
							<Input
								id="entry-clock-out"
								placeholder="18:00"
								value={clockOutTime}
								onChange={(event) => setClockOutTime(event.target.value)}
							/>
						</div>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="entry-note">Note</Label>
						<Input
							id="entry-note"
							placeholder="Reason / correction note"
							value={note}
							onChange={(event) => setNote(event.target.value)}
						/>
					</div>
					<DialogFooter>
						<Button type="submit" disabled={upsertMutation.isPending}>
							{upsertMutation.isPending ? "Saving..." : "Save attendance"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

type IssueRow = {
	id: string;
	employeeId: string;
	employeeName?: string;
	employeeNo?: string;
	date: string;
	type: string;
	justification: string | null;
	status: string;
};

function IssueTypeBadge({ type }: { type: string }) {
	return (
		<Badge variant={type === "absent" ? "destructive" : "secondary"}>
			{type.replace(/_/g, " ")}
		</Badge>
	);
}

function IssueStatusBadge({ status }: { status: string }) {
	const variant =
		status === "verified"
			? "secondary"
			: status === "rejected"
				? "destructive"
				: "outline";
	return <Badge variant={variant}>{status}</Badge>;
}

function IssuesTab({ canReview }: { canReview: boolean }) {
	return (
		<div className="flex flex-col gap-4">
			{canReview ? <IssueReviewCard /> : null}
			<MyIssuesCard />
		</div>
	);
}

function IssueReviewCard() {
	const queryClient = useQueryClient();
	const reviewQuery = useQuery({
		queryKey: ["issues", "review"],
		queryFn: ({ signal }) => listIssuesForReview({ signal }),
	});
	const verifyMutation = useMutation({
		mutationFn: async (input: {
			issueId: string;
			decision: "verified" | "rejected";
		}) => {
			const result = await verifyIssue({ data: input });
			if (!result.ok) {
				throw new Error(result.reason);
			}
			return result;
		},
		onSuccess: (_result, variables) => {
			toast.success(
				variables.decision === "verified"
					? "Justification verified"
					: "Justification rejected",
			);
			queryClient.invalidateQueries({ queryKey: ["issues"] });
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});

	function handleVerify(issueId: string, decision: "verified" | "rejected") {
		verifyMutation.mutate({ issueId, decision });
	}

	const issues = (reviewQuery.data?.issues ?? []) as IssueRow[];

	return (
		<Card>
			<CardHeader>
				<CardTitle>Justifications awaiting verification</CardTitle>
				<CardDescription>
					Review justifications submitted for attendance issues in your scope.
				</CardDescription>
			</CardHeader>
			<CardContent>
				{reviewQuery.isError ? (
					<p className="text-sm text-destructive">Failed to load issues.</p>
				) : reviewQuery.isPending ? (
					<p className="text-sm text-muted-foreground">Loading…</p>
				) : issues.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						Nothing to review right now.
					</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="sticky left-0 z-10 bg-card">
									Employee
								</TableHead>
								<TableHead>Date</TableHead>
								<TableHead>Issue</TableHead>
								<TableHead>Justification</TableHead>
								<TableHead className="w-24" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{issues
								.filter((issue) => issue.status === "pending")
								.map((issue) => (
									<TableRow key={issue.id}>
										<TableCell className="sticky left-0 z-10 bg-card [tr:hover_&]:bg-muted/50">
											{issue.employeeName}
											<span className="ml-2 text-xs text-muted-foreground">
												{issue.employeeNo}
											</span>
										</TableCell>
										<TableCell>{issue.date}</TableCell>
										<TableCell>
											<IssueTypeBadge type={issue.type} />
										</TableCell>
										<TableCell className="max-w-64 text-sm">
											{issue.justification ?? "—"}
										</TableCell>
										<TableCell>
											<div className="flex gap-1">
												<Button
													variant="ghost"
													size="icon"
													aria-label="Verify justification"
													onClick={() => handleVerify(issue.id, "verified")}
												>
													<Check />
												</Button>
												<Button
													variant="ghost"
													size="icon"
													aria-label="Reject justification"
													onClick={() => handleVerify(issue.id, "rejected")}
												>
													<X />
												</Button>
											</div>
										</TableCell>
									</TableRow>
								))}
						</TableBody>
					</Table>
				)}
			</CardContent>
		</Card>
	);
}

function MyIssuesCard() {
	const queryClient = useQueryClient();
	const [justifying, setJustifying] = useState<IssueRow | null>(null);
	const myIssuesQuery = useQuery({
		queryKey: ["issues", "mine"],
		queryFn: ({ signal }) => listMyIssues({ signal }),
	});
	const issues = (myIssuesQuery.data ?? []) as IssueRow[];

	return (
		<Card>
			<CardHeader>
				<CardTitle>My attendance issues</CardTitle>
				<CardDescription>
					Submit a justification for flagged days — your supervisor will verify
					it.
				</CardDescription>
			</CardHeader>
			<CardContent>
				{myIssuesQuery.isError ? (
					<p className="flex items-center gap-2 text-sm text-destructive">
						Failed to load issues.
						<Button
							variant="outline"
							size="sm"
							onClick={() => myIssuesQuery.refetch()}
						>
							Try again
						</Button>
					</p>
				) : myIssuesQuery.isPending ? (
					<p className="text-sm text-muted-foreground">Loading…</p>
				) : issues.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						No attendance issues this month. Keep it up!
					</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Date</TableHead>
								<TableHead>Issue</TableHead>
								<TableHead>Justification</TableHead>
								<TableHead>Status</TableHead>
								<TableHead className="w-12" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{issues.map((issue) => (
								<TableRow key={issue.id}>
									<TableCell>{issue.date}</TableCell>
									<TableCell>
										<IssueTypeBadge type={issue.type} />
									</TableCell>
									<TableCell className="max-w-64 text-sm">
										{issue.justification ?? "—"}
									</TableCell>
									<TableCell>
										<IssueStatusBadge status={issue.status} />
									</TableCell>
									<TableCell>
										{issue.status !== "verified" ? (
											<Button
												variant="ghost"
												size="sm"
												onClick={() => setJustifying(issue)}
											>
												{issue.justification ? "Edit" : "Justify"}
											</Button>
										) : null}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</CardContent>
			<JustificationDialog
				issue={justifying}
				onOpenChange={(open) => {
					if (!open) {
						setJustifying(null);
					}
				}}
				onSaved={() => {
					setJustifying(null);
					toast.success("Justification submitted for verification");
					queryClient.invalidateQueries({ queryKey: ["issues"] });
				}}
			/>
		</Card>
	);
}

function JustificationDialog({
	issue,
	onOpenChange,
	onSaved,
}: {
	issue: IssueRow | null;
	onOpenChange: (open: boolean) => void;
	onSaved: () => void;
}) {
	const [text, setText] = useState("");
	const submitMutation = useMutation({
		mutationFn: async (input: { issueId: string; justification: string }) => {
			const result = await submitJustification({ data: input });
			if (!result.ok) {
				throw new Error(result.reason);
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

	useEffect(() => {
		if (issue) {
			setText(issue.justification ?? "");
		}
	}, [issue]);

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!issue) {
			return;
		}
		submitMutation.mutate({ issueId: issue.id, justification: text });
	}

	return (
		<Dialog open={issue !== null} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						Justification — {issue?.date ?? ""}{" "}
						{issue ? <IssueTypeBadge type={issue.type} /> : null}
					</DialogTitle>
					<DialogDescription>
						Explain the attendance issue. Your supervisor will verify it.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={handleSubmit} className="flex flex-col gap-4">
					<Textarea
						value={text}
						onChange={(event) => setText(event.target.value)}
						required
						minLength={5}
					/>
					<DialogFooter>
						<Button type="submit" disabled={submitMutation.isPending}>
							{submitMutation.isPending
								? "Submitting…"
								: "Submit justification"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
