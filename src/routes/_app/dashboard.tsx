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
import { Skeleton } from "#/components/ui/skeleton";
import {
	clockIn,
	clockOut,
	getTodayAttendance,
} from "#/lib/attendance.functions";
import { authClient } from "#/lib/auth-client";
import { getOrgDashboardStats } from "#/lib/dashboard.functions";
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
			<div className="flex flex-col gap-4 rounded-xl border bg-card p-5 sm:flex-row sm:items-center">
				<Avatar className="size-16 ring-2 ring-border">
					{user?.image ? (
						<AvatarImage src={user.image} alt={user?.name ?? "User avatar"} />
					) : null}
					<AvatarFallback className="text-xl">
						{user?.name?.charAt(0).toUpperCase() ?? "U"}
					</AvatarFallback>
				</Avatar>
				<div className="min-w-0 flex-1">
					<p className="text-sm text-muted-foreground">Welcome back</p>
					{isPending ? (
						<Skeleton className="mt-1 h-8 w-48" />
					) : (
						<h1 className="truncate text-2xl font-semibold">
							<span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
								{user?.name ?? "User"}
							</span>
						</h1>
					)}
					<p className="truncate text-sm text-muted-foreground">
						{user?.email ?? ""}
					</p>
				</div>
			</div>

			{isOrgViewer ? <OrgStatsRow statsQuery={statsQuery} /> : null}
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
				icon={UserCheck}
				to="/attendance"
			/>
			<SummaryCard
				label="On leave today"
				value={String(stats.onLeaveToday)}
				icon={CalendarOff}
				to="/leave"
			/>
			<SummaryCard
				label="Late arrivals"
				value={String(stats.lateToday)}
				icon={AlarmClock}
				to="/attendance"
			/>
			<SummaryCard
				label="Active employees"
				value={String(stats.totalEmployees)}
				detail={
					stats.totalEmployees === 0
						? "Add employees to start tracking"
						: undefined
				}
				icon={Users}
				to="/employees"
			/>
		</div>
	);
}

function ClockWidget({
	todayQuery,
}: {
	todayQuery: ReturnType<
		typeof useQuery<Awaited<ReturnType<typeof getTodayAttendance>>>
	>;
}) {
	const queryClient = useQueryClient();
	const clockMutation = useMutation({
		mutationFn: async (action: "in" | "out") => {
			const result = action === "in" ? await clockIn() : await clockOut();
			if (!result.ok) {
				throw new Error(result.reason);
			}
			return { action, result };
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
			queryClient.invalidateQueries({ queryKey: ["dashboard"] });
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});

	if (todayQuery.isError || !todayQuery.data) {
		return null;
	}
	const today = todayQuery.data;
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
						You have not clocked in today.
					</p>
				)}
				<div className="ml-auto flex gap-2">
					<Button
						onClick={() => clockMutation.mutate("in")}
						disabled={clockMutation.isPending || record !== null}
					>
						<LogIn />
						{clockMutation.isPending ? "…" : "Clock in"}
					</Button>
					<Button
						variant="outline"
						onClick={() => clockMutation.mutate("out")}
						disabled={clockMutation.isPending || !isClockedIn}
					>
						<LogOut />
						Clock out
					</Button>
				</div>
			</CardContent>
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
			className={to ? "transition-colors hover:border-primary/40" : undefined}
		>
			<CardHeader className="flex-row items-center justify-between space-y-0">
				<CardDescription>{label}</CardDescription>
				<span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary/15 to-primary/5 text-primary">
					<Icon className="size-4" />
				</span>
			</CardHeader>
			<CardContent>
				<CardTitle className="truncate text-3xl">{value}</CardTitle>
				{detail ? (
					<p className="mt-1 text-xs text-muted-foreground">{detail}</p>
				) : null}
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
