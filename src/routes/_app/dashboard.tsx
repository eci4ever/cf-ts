import { createFileRoute, Link } from "@tanstack/react-router";
import {
	AlarmClock,
	CalendarOff,
	FileText,
	KeyRound,
	MailCheck,
	UserCheck,
	Users,
} from "lucide-react";
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
import { authClient } from "#/lib/auth-client";

export const Route = createFileRoute("/_app/dashboard")({
	staticData: { title: "Dashboard" },
	component: DashboardPage,
});

function DashboardPage() {
	const { data, isPending } = authClient.useSession();
	const user = data?.user;

	return (
		<>
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
							{user?.name ?? "User"}
						</h1>
					)}
					<p className="truncate text-sm text-muted-foreground">
						{user?.email ?? ""}
					</p>
				</div>
				<Badge variant="secondary" className="w-fit">
					Attendance workspace
				</Badge>
			</div>

			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				<SummaryCard label="Present today" value="0" icon={UserCheck} />
				<SummaryCard label="On leave" value="0" icon={CalendarOff} />
				<SummaryCard label="Late arrivals" value="0" icon={AlarmClock} />
				<SummaryCard
					label="Total employees"
					value="0"
					detail="Add employees to start tracking"
					icon={Users}
				/>
			</div>

			<div className="grid gap-4 lg:grid-cols-2">
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
						<SecurityRow
							icon={KeyRound}
							label="Password sign-in"
							value="You sign in with email and password."
							positive={true}
							positiveLabel="Ready"
							reviewLabel="Review"
						/>
					</CardContent>
				</Card>
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
						<QuickAction
							to="/employees"
							icon={Users}
							label="Manage employees"
						/>
						<QuickAction to="/reports" icon={FileText} label="View reports" />
					</CardContent>
				</Card>
			</div>
		</>
	);
}

function SummaryCard({
	label,
	value,
	detail,
	icon: Icon,
}: {
	label: string;
	value: string;
	detail?: string;
	icon: React.ComponentType<{ className?: string }>;
}) {
	return (
		<Card>
			<CardHeader className="flex-row items-center justify-between space-y-0">
				<CardDescription>{label}</CardDescription>
				<Icon className="size-4 text-muted-foreground" />
			</CardHeader>
			<CardContent>
				<CardTitle className="truncate text-xl">{value}</CardTitle>
				{detail ? (
					<p className="mt-1 text-xs text-muted-foreground">{detail}</p>
				) : null}
			</CardContent>
		</Card>
	);
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
