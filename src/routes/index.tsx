import { createFileRoute } from "@tanstack/react-router";
import {
	BarChart3,
	CalendarCheck,
	CalendarClock,
	CalendarDays,
	MapPin,
	ShieldCheck,
	Timer,
} from "lucide-react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
	return (
		<div className="min-h-svh bg-background text-foreground">
			<SiteHeader />
			<main>
				<Hero />
				<Stats />
				<Features />
				<HowItWorks />
				<CtaBand />
			</main>
			<SiteFooter />
		</div>
	);
}

function SiteHeader() {
	return (
		<header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
			<div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
				<div className="flex items-center gap-2">
					<span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
						<CalendarCheck className="size-4" />
					</span>
					<span className="font-semibold tracking-tight">
						Attendance Management System
					</span>
				</div>
				<nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
					<a href="#features" className="hover:text-foreground">
						Features
					</a>
					<a href="#how-it-works" className="hover:text-foreground">
						How it works
					</a>
				</nav>
				<div className="flex items-center gap-2">
					<Button variant="ghost" asChild>
						<a href="#">Sign in</a>
					</Button>
					<Button asChild>
						<a href="#">Get started</a>
					</Button>
				</div>
			</div>
		</header>
	);
}

function Hero() {
	return (
		<section className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-6 py-24 text-center">
			<Badge variant="secondary">Attendance Management System</Badge>
			<h1 className="max-w-3xl text-balance text-4xl font-bold tracking-tight sm:text-5xl">
				Attendance tracking without the busywork
			</h1>
			<p className="max-w-2xl text-balance text-lg text-muted-foreground">
				Check-ins, shifts, leave requests, and payroll-ready reports in one
				place. Your team clocks in seconds, and you always know who was where,
				and when.
			</p>
			<div className="flex flex-wrap items-center justify-center gap-3">
				<Button size="lg" asChild>
					<a href="#">Start tracking free</a>
				</Button>
				<Button size="lg" variant="outline" asChild>
					<a href="#features">Explore features</a>
				</Button>
			</div>
		</section>
	);
}

function Stats() {
	const stats = [
		{ value: "5s", label: "Average clock-in time" },
		{ value: "12,000+", label: "Teams onboard" },
		{ value: "38%", label: "Fewer payroll disputes" },
		{ value: "99.9%", label: "Uptime" },
	];

	return (
		<section className="border-y bg-muted/40">
			<div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-8 px-6 py-10 sm:grid-cols-4">
				{stats.map((stat) => (
					<div key={stat.label} className="text-center">
						<p className="text-3xl font-bold tracking-tight">{stat.value}</p>
						<p className="text-sm text-muted-foreground">{stat.label}</p>
					</div>
				))}
			</div>
		</section>
	);
}

const features = [
	{
		icon: Timer,
		title: "One-tap clock in / out",
		description:
			"Employees check in from web or mobile in seconds, with automatic break and overtime tracking.",
	},
	{
		icon: MapPin,
		title: "Geofenced clock-ins",
		description:
			"Restrict check-ins to approved sites and verify location on every punch.",
	},
	{
		icon: BarChart3,
		title: "Real-time dashboards",
		description:
			"Live attendance, absence trends, and late-arrival reports across teams and locations.",
	},
	{
		icon: CalendarDays,
		title: "Leave management",
		description:
			"Time-off requests, approvals, and balances in one calendar, synced with attendance.",
	},
	{
		icon: CalendarClock,
		title: "Shift & roster planning",
		description:
			"Build schedules, publish rosters, and flag gaps before the week starts.",
	},
	{
		icon: ShieldCheck,
		title: "Roles & permissions",
		description:
			"Admins, managers, and employees see exactly what they need — nothing more.",
	},
];

function Features() {
	return (
		<section id="features" className="mx-auto w-full max-w-6xl px-6 py-24">
			<div className="mb-12 flex flex-col items-center gap-3 text-center">
				<h2 className="text-3xl font-bold tracking-tight">
					Everything attendance, in one system
				</h2>
				<p className="max-w-xl text-muted-foreground">
					From punch to payroll, handle the whole workflow without
					spreadsheets or chasing timesheets.
				</p>
			</div>
			<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
				{features.map((feature) => (
					<Card key={feature.title}>
						<CardHeader>
							<span className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
								<feature.icon className="size-5" />
							</span>
							<CardTitle>{feature.title}</CardTitle>
							<CardDescription>{feature.description}</CardDescription>
						</CardHeader>
					</Card>
				))}
			</div>
		</section>
	);
}

const steps = [
	{
		step: "1",
		title: "Create your workspace",
		description:
			"Set up your organization, locations, and attendance policies in minutes.",
	},
	{
		step: "2",
		title: "Invite your team",
		description:
			"Employees join by email and clock in from the web or their phones.",
	},
	{
		step: "3",
		title: "Track and export",
		description:
			"Watch attendance roll in live and export payroll-ready reports anytime.",
	},
];

function HowItWorks() {
	return (
		<section
			id="how-it-works"
			className="border-y bg-muted/40 py-24"
		>
			<div className="mx-auto w-full max-w-6xl px-6">
				<div className="mb-12 flex flex-col items-center gap-3 text-center">
					<h2 className="text-3xl font-bold tracking-tight">
						Up and running in three steps
					</h2>
					<p className="max-w-xl text-muted-foreground">
						No hardware, no complex setup — start tracking attendance today.
					</p>
				</div>
				<div className="grid gap-6 md:grid-cols-3">
					{steps.map((item) => (
						<div
							key={item.step}
							className="flex flex-col gap-2 rounded-lg border bg-background p-6"
						>
							<span className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
								{item.step}
							</span>
							<h3 className="font-semibold">{item.title}</h3>
							<p className="text-sm text-muted-foreground">
								{item.description}
							</p>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}

function CtaBand() {
	return (
		<section className="mx-auto w-full max-w-6xl px-6 py-24">
			<div className="flex flex-col items-center gap-6 rounded-2xl border bg-muted/40 p-12 text-center">
				<h2 className="text-3xl font-bold tracking-tight">
					Ready to simplify attendance?
				</h2>
				<p className="max-w-xl text-muted-foreground">
					Join thousands of teams who swapped manual timesheets for automated
					attendance tracking.
				</p>
				<Button size="lg" asChild>
					<a href="#">Create your workspace</a>
				</Button>
			</div>
		</section>
	);
}

function SiteFooter() {
	return (
		<footer className="border-t">
			<div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground sm:flex-row">
				<p>© {new Date().getFullYear()} Attendance Management System</p>
				<div className="flex gap-6">
					<a href="#" className="hover:text-foreground">
						Privacy
					</a>
					<a href="#" className="hover:text-foreground">
						Terms
					</a>
					<a href="#" className="hover:text-foreground">
						Contact
					</a>
				</div>
			</div>
		</footer>
	);
}
