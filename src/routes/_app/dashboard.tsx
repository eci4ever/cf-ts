import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useRouteContext } from "@tanstack/react-router";
import {
	AlarmClock,
	CalendarOff,
	CalendarPlus,
	FileText,
	LogIn,
	LogOut,
	MailCheck,
	UserCheck,
	Users,
} from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
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
import { Skeleton } from "#/components/ui/skeleton";
import { Textarea } from "#/components/ui/textarea";
import {
	clockIn,
	clockOut,
	getTodayAttendance,
} from "#/lib/attendance.functions";
import { authClient } from "#/lib/auth-client";
import { getOrgAttendanceTrend, getOrgDashboardStats } from "#/lib/dashboard.functions";
import { getPosition } from "#/lib/geolocation";
import { getLeaveOverview } from "#/lib/leave.functions";
import { formatMinutes } from "#/lib/schedule";

export const Route = createFileRoute("/_app/dashboard")({
	staticData: { title: "Dashboard" },
	component: DashboardPage,
});

function DashboardPage() {
	const { orgRole } = useRouteContext({ from: "/_app" });
	const { data: session, isPending } = authClient.useSession();
	const user = session?.user;
	const isOrgViewer =
		orgRole === "admin" || orgRole === "owner" || orgRole === "supervisor";

	const statsQuery = useQuery({
		queryKey: ["dashboard", "stats"],
		queryFn: getOrgDashboardStats,
		enabled: isOrgViewer,
	});
	const trendQuery = useQuery({
		queryKey: ["dashboard", "trend"],
		queryFn: getOrgAttendanceTrend,
		enabled: isOrgViewer,
	});
	const todayQuery = useQuery({
		queryKey: ["attendance", "today"],
		queryFn: getTodayAttendance,
	});
	const leaveQuery = useQuery({
		queryKey: ["leave", "overview"],
		queryFn: getLeaveOverview,
	});

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center gap-3 rounded-xl border bg-card p-4">
				<Avatar className="size-11 ring-2 ring-border">
					{user?.image ? (
						<AvatarImage src={user.image} alt={user?.name ?? "User avatar"} />
					) : null}
					<AvatarFallback className="text-base">
						{user?.name?.charAt(0).toUpperCase() ?? "U"}
					</AvatarFallback>
				</Avatar>
				<div className="min-w-0 flex-1">
					{isPending ? (
						<Skeleton className="h-6 w-48" />
					) : (
						<h1 className="truncate text-lg font-semibold leading-tight">
							{user?.name ?? "User"}
						</h1>
					)}
					<p className="truncate text-xs text-muted-foreground">
						{user?.email ?? ""}
					</p>
				</div>
			</div>

			{isOrgViewer ? <OrgStatsRow statsQuery={statsQuery} /> : null}
			{isOrgViewer ? <AttendanceTrendCard trendQuery={trendQuery} /> : null}
			<ClockWidget todayQuery={todayQuery} />

			<div className="grid gap-4 lg:grid-cols-2">
				{leaveQuery.data?.canApply ? <LeaveBalancesCard /> : null}
				<Card>
					<CardHeader>
						<CardTitle>Account security</CardTitle>
						<CardDescription>
							Your current identity and sign-in safeguards.
						</CardDescription>
					</CardHeader>
					<CardContent className="grid gap-3">
						<SecurityRow
							icon={MailCheck}
							label="Email address"
							value={user?.email ?? "Loading..."}
							positive={user?.emailVerified ?? false}
							positiveLabel="Verified"
							reviewLabel="Unverified"
						/>
					</CardContent>
				</Card>
				<QuickActionsCard isOrgViewer={isOrgViewer} />
			</div>
		</div>
	);
}

function OrgStatsRow({
	statsQuery,
}: {
	statsQuery: ReturnType<
		typeof useQuery<Awaited<ReturnType<typeof getOrgDashboardStats>>>
	>;
}) {
	if (statsQuery.isPending) {
		return (
			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				{[1, 2, 3, 4].map((index) => (
					<Card key={index}>
						<CardContent className="pt-6">
							<Skeleton className="h-10 w-full" />
						</CardContent>
					</Card>
				))}
			</div>
		);
	}
	if (statsQuery.isError || !statsQuery.data) {
		return null;
	}
	const stats = statsQuery.data;
	return (
		<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
			<SummaryCard
				label="Present today"
				value={String(stats.presentToday)}
				detail={`of ${stats.totalEmployees} employees`}
				icon={UserCheck}
				to="/attendance"
			/>
			<SummaryCard
				label="On leave today"
				value={String(stats.onLeaveToday)}
				detail="approved leave"
				icon={CalendarOff}
				to="/leave"
			/>
			<SummaryCard
				label="Late arrivals"
				value={String(stats.lateToday)}
				detail="clocked in past grace"
				icon={AlarmClock}
				to="/attendance"
			/>
			<SummaryCard
				label="Active employees"
				value={String(stats.totalEmployees)}
				detail={
					stats.totalEmployees === 0
						? "Add employees to start tracking"
						: "in this organization"
				}
				icon={Users}
				to="/employees"
			/>
		</div>
	);
}

function AttendanceTrendCard({
	trendQuery,
}: {
	trendQuery: ReturnType<
		typeof useQuery<Awaited<ReturnType<typeof getOrgAttendanceTrend>>>
	>;
}) {
	if (trendQuery.isPending) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Attendance trend</CardTitle>
				</CardHeader>
				<CardContent>
					<Skeleton className="h-24 w-full" />
				</CardContent>
			</Card>
		);
	}
	const weeks = trendQuery.data?.weeks ?? [];
	if (trendQuery.isError || weeks.length === 0) {
		return null;
	}
	return (
		<Card>
			<CardHeader>
				<CardTitle>Attendance trend</CardTitle>
				<CardDescription>
					Present rate vs expected working days, excluding approved leave. Last{" "}
					{weeks.length} weeks.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="flex items-end gap-2">
					{weeks.map((week) => {
						const height =
							week.rate === null ? 0 : Math.max(Math.min(week.rate, 100), 4);
						return (
							<div
								key={week.weekStart}
								className="flex min-w-0 flex-1 flex-col items-center gap-1"
							>
								<span className="text-[10px] tabular-nums text-muted-foreground">
									{week.rate === null ? "—" : `${week.rate}%`}
								</span>
								<div className="flex h-24 w-full items-end rounded bg-muted/40">
									<div
										className="w-full rounded bg-primary/80"
										style={{ height: `${height}%` }}
									/>
								</div>
								<span className="text-[10px] tabular-nums text-muted-foreground">
									{new Date(`${week.weekStart}T00:00:00Z`).toLocaleDateString(
										"en-US",
										{ day: "numeric", month: "short", timeZone: "UTC" },
									)}
								</span>
								<span
									className={`text-[10px] tabular-nums ${week.late > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}
								>
									{week.late} late
								</span>
							</div>
						);
					})}
				</div>
			</CardContent>
		</Card>
	);
}

type ClockCoords = {
	latitude: number;
	longitude: number;
	accuracy: number | null;
};

type NotePrompt = {
	action: "in" | "out";
	reasons: string[];
	coords?: ClockCoords;
	siteId?: string;
};

function minutesSinceMidnight(timezone: string): number {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: timezone,
		hour12: false,
		hour: "2-digit",
		minute: "2-digit",
	}).formatToParts(new Date());
	const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
	const minute = Number(
		parts.find((part) => part.type === "minute")?.value ?? 0,
	);
	return (hour % 24) * 60 + minute;
}

function haversineMeters(
	lat1: number,
	lng1: number,
	lat2: number,
	lng2: number,
): number {
	const R = 6_371_000;
	const toRad = (deg: number) => (deg * Math.PI) / 180;
	const dLat = toRad(lat2 - lat1);
	const dLng = toRad(lng2 - lng1);
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
	return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

function ClockWidget({
	todayQuery,
}: {
	todayQuery: ReturnType<
		typeof useQuery<Awaited<ReturnType<typeof getTodayAttendance>>>
	>;
}) {
	const queryClient = useQueryClient();
	const [selectedSiteId, setSelectedSiteId] = useState<string>("");
	const [notePrompt, setNotePrompt] = useState<NotePrompt | null>(null);
	const [noteText, setNoteText] = useState("");

	const today = todayQuery.data;
	const configuredSites = (today?.sites ?? []).filter(
		(site) => site.lat !== null && site.lng !== null,
	);

	useEffect(() => {
		if (!selectedSiteId && configuredSites.length > 0) {
			setSelectedSiteId(
				today?.assignedSiteId &&
					configuredSites.some((site) => site.id === today.assignedSiteId)
					? today.assignedSiteId
					: configuredSites[0].id,
			);
		}
	}, [configuredSites, selectedSiteId, today]);

	const clockMutation = useMutation({
		mutationFn: async (input: {
			action: "in" | "out";
			coords?: ClockCoords;
			siteId?: string;
			note?: string;
		}) => {
			const geofence = todayQuery.data?.geofence;
			if (geofence?.geofenceEnabled && geofence.blockedReason) {
				throw new Error(geofence.blockedReason);
			}
			const payload = input.coords
				? {
						latitude: input.coords.latitude,
						longitude: input.coords.longitude,
						accuracy: input.coords.accuracy,
						siteId: input.siteId,
						note: input.note,
					}
				: { note: input.note };
			const result =
				input.action === "in"
					? await clockIn({ data: payload })
					: await clockOut({ data: payload });
			if (!result.ok) {
				throw new Error(result.reason);
			}
			return { action: input.action, result };
		},
		onSuccess: ({ action, result }) => {
			if (action === "in") {
				const late =
					"record" in result && result.record.clockInStatus === "late";
				toast.success(late ? "Clocked in (late)" : "Clocked in");
			} else {
				const short = "status" in result && result.status === "short";
				toast.success(
					short ? "Clocked out — note: under target hours" : "Clocked out",
				);
			}
			queryClient.invalidateQueries({ queryKey: ["attendance"] });
			queryClient.invalidateQueries({ queryKey: ["issues"] });
			queryClient.invalidateQueries({ queryKey: ["dashboard"] });
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});

	function predictIssues(
		action: "in" | "out",
		data: NonNullable<typeof todayQuery.data>,
		coords?: ClockCoords,
	): string[] {
		const reasons: string[] = [];
		const geofence = data.geofence;
		if (action === "in") {
			const threshold =
				data.schedule.workStartMinutes +
				(data.employee?.shift === "flexi"
					? 0
					: data.schedule.graceMinutes);
			if (minutesSinceMidnight(data.schedule.timezone) > threshold) {
				reasons.push("you are clocking in late");
			}
		} else if (data.targetClockOut && new Date() < data.targetClockOut) {
			reasons.push("you are leaving before your target hours");
		}
		if (
			coords &&
			geofence?.geofenceEnabled &&
			geofence.site &&
			!geofence.blockedReason
		) {
			const distance = haversineMeters(
				coords.latitude,
				coords.longitude,
				geofence.site.lat,
				geofence.site.lng,
			);
			if (distance > geofence.site.radiusM) {
				reasons.push(
					`you are outside the work site radius (~${Math.round(distance)}m away)`,
				);
			}
		}
		return reasons;
	}

	async function handleClock(action: "in" | "out") {
		if (!today) {
			return;
		}
		const geofence = today.geofence;
		let coords: ClockCoords | undefined;
		if (geofence?.geofenceEnabled) {
			if (geofence.blockedReason) {
				toast.error(geofence.blockedReason);
				return;
			}
			try {
				coords = await getPosition();
			} catch (error) {
				toast.error(
					error instanceof Error ? error.message : "Failed to get location",
				);
				return;
			}
		}
		const siteId =
			action === "in" && configuredSites.length > 1 && selectedSiteId
				? selectedSiteId
				: undefined;
		const reasons = predictIssues(action, today, coords);
		if (reasons.length > 0) {
			setNotePrompt({ action, reasons, coords, siteId });
			setNoteText("");
			return;
		}
		clockMutation.mutate({ action, coords, siteId });
	}

	function submitWithNote() {
		if (!notePrompt) {
			return;
		}
		clockMutation.mutate({
			action: notePrompt.action,
			coords: notePrompt.coords,
			siteId: notePrompt.siteId,
			note: noteText,
		});
		setNotePrompt(null);
	}

	if (todayQuery.isError || !today) {
		return null;
	}
	const employee = today.employee;
	if (!employee) {
		return null;
	}
	const record = today.record;
	const isClockedIn = record !== null && record.clockOut === null;

	return (
		<Card>
			<CardHeader>
				<CardTitle>
					Today — {new Date(`${today.today}T00:00:00`).toLocaleDateString()}
				</CardTitle>
				<CardDescription>
					{employee.name} · {employee.shift} shift · work hours{" "}
					{formatMinutes(today.schedule.workStartMinutes)}–
					{formatMinutes(today.schedule.workEndMinutes)}
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<div className="flex flex-wrap items-center gap-4">
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
							You have not clocked in today.
						</p>
					)}
					<div className="ml-auto flex flex-wrap items-center gap-2">
						{!record && configuredSites.length > 1 ? (
							<select
								aria-label="Work site"
								value={selectedSiteId}
								onChange={(event) => setSelectedSiteId(event.target.value)}
								className="h-9 rounded-md border bg-background px-3 text-sm"
							>
								{configuredSites.map((site) => (
									<option key={site.id} value={site.id}>
										{site.name}
										{site.id === today.assignedSiteId ? " (assigned)" : ""}
									</option>
								))}
							</select>
						) : null}
						<Button
							onClick={() => handleClock("in")}
							disabled={clockMutation.isPending || record !== null}
						>
							<LogIn />
							{clockMutation.isPending ? "…" : "Clock in"}
						</Button>
						<Button
							variant="outline"
							onClick={() => handleClock("out")}
							disabled={clockMutation.isPending || !isClockedIn}
						>
							<LogOut />
							Clock out
						</Button>
					</div>
				</div>
				{record?.note ? (
					<p className="text-xs text-muted-foreground">
						Your clock-in note: {record.note}
					</p>
				) : null}
				{record?.clockOutNote ? (
					<p className="text-xs text-muted-foreground">
						Your clock-out note: {record.clockOutNote}
					</p>
				) : null}
			</CardContent>
			<Dialog
				open={notePrompt !== null}
				onOpenChange={(open) => {
					if (!open) {
						setNotePrompt(null);
					}
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							{notePrompt?.action === "in"
								? "Issue detected — clock in"
								: "Issue detected — clock out"}
						</DialogTitle>
						<DialogDescription>
							Just a heads-up: {notePrompt?.reasons.join(" and ")}. You can add
							a short note so your supervisor understands the situation.
						</DialogDescription>
					</DialogHeader>
					<Textarea
						value={noteText}
						onChange={(event) => setNoteText(event.target.value)}
						placeholder="e.g. Bus was late, left my phone charger at the outlet…"
						maxLength={300}
					/>
					<DialogFooter>
						<Button variant="outline" onClick={() => setNotePrompt(null)}>
							Cancel
						</Button>
						<Button variant="outline" onClick={submitWithNote}>
							Submit with note
						</Button>
						<Button
							onClick={() => {
								if (notePrompt) {
									clockMutation.mutate({
										action: notePrompt.action,
										coords: notePrompt.coords,
										siteId: notePrompt.siteId,
									});
								}
								setNotePrompt(null);
							}}
						>
							Clock without note
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</Card>
	);
}

function ClockInBadge({ status }: { status: string }) {
	if (status === "manual") {
		return <Badge variant="outline">manual</Badge>;
	}
	return (
		<Badge variant={status === "late" ? "destructive" : "secondary"}>
			{status}
		</Badge>
	);
}

function ClockOutBadge({ status }: { status: string | null }) {
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

function LeaveBalancesCard() {
	const leaveQuery = useQuery({
		queryKey: ["leave", "overview"],
		queryFn: getLeaveOverview,
	});
	if (leaveQuery.isPending || !leaveQuery.data) {
		return null;
	}
	const balances = leaveQuery.data.balances as {
		id: string;
		name: string;
		quotaDays: number | null;
		remainingDays: number | null;
		usedDays: number;
	}[];

	return (
		<Card>
			<CardHeader className="flex-row items-center justify-between space-y-0">
				<div className="space-y-1.5">
					<CardTitle>My leave</CardTitle>
					<CardDescription>Remaining balance this year</CardDescription>
				</div>
				<Button size="sm" variant="outline" asChild>
					<Link to="/leave">
						<CalendarPlus />
						Apply
					</Link>
				</Button>
			</CardHeader>
			<CardContent className="grid gap-4 sm:grid-cols-2">
				{balances.map((balance) => {
					const percent =
						balance.quotaDays === null || balance.quotaDays === 0
							? 0
							: Math.min(
									100,
									Math.round(
										((balance.remainingDays ?? 0) / balance.quotaDays) * 100,
									),
								);
					return (
						<div key={balance.id}>
							<div className="flex items-center justify-between text-sm">
								<span className="font-medium">{balance.name}</span>
								<span className="text-muted-foreground">
									{balance.quotaDays === null
										? "Unlimited"
										: `${balance.remainingDays}/${balance.quotaDays} left`}
								</span>
							</div>
							{balance.quotaDays !== null ? (
								<div className="mt-1.5 h-1.5 rounded-full bg-muted">
									<div
										className="h-full rounded-full bg-gradient-to-r from-primary to-primary/50"
										style={{ width: `${percent}%` }}
									/>
								</div>
							) : null}
						</div>
					);
				})}
			</CardContent>
		</Card>
	);
}

function QuickActionsCard({ isOrgViewer }: { isOrgViewer: boolean }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Quick actions</CardTitle>
				<CardDescription>
					Jump straight into your daily attendance workflow.
				</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-2 sm:grid-cols-2">
				<QuickAction
					to="/attendance"
					icon={UserCheck}
					label="Take attendance"
				/>
				<QuickAction to="/leave" icon={CalendarPlus} label="Apply for leave" />
				<QuickAction to="/reports" icon={FileText} label="View reports" />
				{isOrgViewer ? (
					<QuickAction to="/employees" icon={Users} label="Manage employees" />
				) : null}
			</CardContent>
		</Card>
	);
}

function SummaryCard({
	label,
	value,
	detail,
	icon: Icon,
	to,
}: {
	label: string;
	value: string;
	detail?: string;
	icon: React.ComponentType<{ className?: string }>;
	to?: string;
}) {
	const body = (
		<Card
			className={to ? "h-full transition-colors hover:border-primary/40" : "h-full"}
		>
			<CardContent className="flex h-full flex-col gap-2 pt-4">
				<div className="flex items-center justify-between gap-2">
					<CardDescription className="text-xs">{label}</CardDescription>
					<span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/15 to-primary/5 text-primary">
						<Icon className="size-3.5" />
					</span>
				</div>
				<CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
				<p className="mt-auto text-xs text-muted-foreground">
					{detail ?? ""}
				</p>
			</CardContent>
		</Card>
	);
	if (to) {
		return (
			<Link to={to} className="group">
				{body}
			</Link>
		);
	}
	return body;
}

function SecurityRow({
	icon: Icon,
	label,
	value,
	positive,
	positiveLabel,
	reviewLabel,
}: {
	icon: React.ComponentType<{ className?: string }>;
	label: string;
	value: string;
	positive: boolean;
	positiveLabel: string;
	reviewLabel: string;
}) {
	return (
		<div className="flex items-center gap-3 rounded-lg border p-3">
			<Icon className="size-5 text-muted-foreground" />
			<div className="min-w-0 flex-1">
				<p className="text-sm font-medium">{label}</p>
				<p className="truncate text-xs text-muted-foreground">{value}</p>
			</div>
			<Badge variant={positive ? "secondary" : "outline"}>
				{positive ? positiveLabel : reviewLabel}
			</Badge>
		</div>
	);
}

function QuickAction({
	to,
	icon: Icon,
	label,
}: {
	to: string;
	icon: React.ComponentType<{ className?: string }>;
	label: string;
}) {
	return (
		<Button variant="outline" className="justify-start" asChild>
			<Link to={to}>
				<Icon className="size-4" />
				{label}
			</Link>
		</Button>
	);
}
