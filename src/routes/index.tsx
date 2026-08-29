import { createFileRoute, Link } from "@tanstack/react-router";
import {
	BarChart3,
	CalendarCheck,
	CalendarDays,
	Check,
	ClipboardCheck,
	Timer,
	X,
} from "lucide-react";
import type { ReactNode } from "react";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "#/components/ui/accordion";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { getSession } from "#/lib/auth.functions";
import { cn } from "#/lib/utils";

export const Route = createFileRoute("/")({
	beforeLoad: async () => {
		const session = await getSession();
		return { authenticated: session !== null };
	},
	component: Home,
});

function Home() {
	return (
		<div className="min-h-svh bg-background text-foreground">
			<SiteHeader />
			<main>
				<Hero />
				<Features />
				<HowItWorks />
				<Pricing />
				<Faq />
				<CtaBand />
			</main>
			<SiteFooter />
		</div>
	);
}

function SiteHeader() {
	const { authenticated } = Route.useRouteContext();
	return (
		<header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
			<div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
				<div className="flex items-center gap-2">
					<span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
						<CalendarCheck className="size-4" />
					</span>
					<span className="hidden font-semibold tracking-tight sm:inline">
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
					<a href="#pricing" className="hover:text-foreground">
						Pricing
					</a>
				</nav>
				<div className="flex items-center gap-2">
					{authenticated ? (
						<Button asChild>
							<Link to="/dashboard">Dashboard</Link>
						</Button>
					) : (
						<>
							<Button variant="ghost" asChild>
								<Link to="/login">Sign in</Link>
							</Button>
							<Button asChild>
								<Link to="/signup">Get started</Link>
							</Button>
						</>
					)}
				</div>
			</div>
		</header>
	);
}

function Hero() {
	return (
		<section className="relative overflow-hidden">
			<div
				aria-hidden
				className="pointer-events-none absolute -top-32 left-1/2 h-[420px] w-[820px] max-w-none -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
			/>
			<section className="relative mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-6 py-24 text-center">
				<Badge variant="secondary" className="gap-2">
					<span className="size-1.5 rounded-full bg-primary" />
					Built for Malaysian SMEs
				</Badge>
				<h1 className="max-w-3xl text-balance text-4xl font-bold tracking-tight sm:text-5xl">
					Attendance tracking{" "}
					<span className="bg-gradient-to-r from-primary to-primary/50 bg-clip-text text-transparent">
						without the busywork
					</span>
				</h1>
				<p className="max-w-2xl text-balance text-lg text-muted-foreground">
					Clock-ins, shifts, leave approvals, and payroll-ready reports in one
					place. From RM29/month in MYT — free for your first 5 employees.
				</p>
				<div className="grid w-full max-w-xs gap-3 sm:flex sm:max-w-none sm:flex-wrap sm:items-center sm:justify-center">
					<Button size="lg" asChild>
						<Link to="/signup">Start tracking free</Link>
					</Button>
					<Button size="lg" variant="outline" asChild>
						<a href="#features">Explore features</a>
					</Button>
				</div>
				<p className="text-xs text-muted-foreground">
					No credit card required · No hardware · Works on any phone
				</p>
			</section>
		</section>
	);
}

function ClockMockup() {
	return (
		<div className="flex flex-col gap-2 text-xs">
			<div className="flex items-center justify-between rounded-md bg-background px-3 py-2">
				<span className="flex items-center gap-2 font-medium">
					<span className="size-1.5 rounded-full bg-emerald-500" />
					Clock in · 09:02
				</span>
				<Badge variant="secondary">on time</Badge>
			</div>
			<div className="flex items-center justify-between rounded-md bg-background px-3 py-2">
				<span className="flex items-center gap-2 font-medium">
					<span className="size-1.5 rounded-full bg-amber-500" />
					Clock out · 17:41
				</span>
				<Badge variant="destructive">short</Badge>
			</div>
		</div>
	);
}

function LeaveMockup() {
	const rows = [
		{ name: "Annual", value: "12 / 14 days", width: "86%" },
		{ name: "Sick", value: "4 / 10 days", width: "40%" },
	];
	return (
		<div className="flex flex-col gap-3 text-xs">
			{rows.map((row) => (
				<div key={row.name}>
					<div className="flex justify-between font-medium">
						<span>{row.name}</span>
						<span className="text-muted-foreground">{row.value}</span>
					</div>
					<div className="mt-1 h-1.5 rounded-full bg-background">
						<div
							className="h-full rounded-full bg-gradient-to-r from-primary to-primary/50"
							style={{ width: row.width }}
						/>
					</div>
				</div>
			))}
		</div>
	);
}

function ApprovalsMockup() {
	const rows = [
		{ initial: "A", name: "Aiman", detail: "Annual · 2 days" },
		{ initial: "M", name: "Mei Lin", detail: "Sick · 1 day" },
	];
	return (
		<div className="flex flex-col gap-2 text-xs">
			{rows.map((row) => (
				<div
					key={row.name}
					className="flex items-center gap-2 rounded-md bg-background px-3 py-2"
				>
					<span className="flex size-6 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
						{row.initial}
					</span>
					<span className="flex-1 font-medium">
						{row.name}
						<span className="ml-1.5 text-muted-foreground">{row.detail}</span>
					</span>
					<Check className="size-3.5 text-emerald-600" />
					<X className="size-3.5 text-red-500" />
				</div>
			))}
		</div>
	);
}

function ReportsMockup() {
	const bars = [60, 80, 45, 90, 70, 85, 55];
	return (
		<div className="text-xs">
			<div className="flex h-16 items-end gap-1.5">
				{bars.map((height) => (
					<div
						key={height}
						className="flex-1 rounded-t bg-gradient-to-t from-primary/60 to-primary"
						style={{ height: `${height}%` }}
					/>
				))}
			</div>
			<p className="mt-2 text-muted-foreground">
				Attendance this month ·{" "}
				<span className="font-medium text-foreground">96%</span>
			</p>
		</div>
	);
}

function FeatureCard({
	icon: Icon,
	title,
	description,
	className,
	children,
}: {
	icon: typeof Timer;
	title: string;
	description: string;
	className?: string;
	children?: ReactNode;
}) {
	return (
		<div
			className={cn(
				"group relative flex flex-col overflow-hidden rounded-lg border bg-card transition-colors hover:border-primary/40",
				className,
			)}
		>
			<div
				aria-hidden
				className="pointer-events-none absolute -top-20 right-0 size-48 rounded-full bg-primary/10 opacity-0 blur-3xl transition-opacity duration-300 group-hover:opacity-100"
			/>
			<div className="relative flex h-full flex-col gap-3 p-6">
				<span className="flex size-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary/15 to-primary/5 text-primary">
					<Icon className="size-5" />
				</span>
				<div>
					<h3 className="font-semibold">{title}</h3>
					<p className="text-sm text-muted-foreground">{description}</p>
				</div>
				{children ? (
					<div className="mt-auto rounded-lg border bg-muted/30 p-3">
						{children}
					</div>
				) : null}
			</div>
		</div>
	);
}

function Features() {
	return (
		<section
			id="features"
			className="mx-auto w-full max-w-6xl scroll-mt-16 px-6 py-24"
		>
			<div className="mb-12 flex flex-col items-center gap-3 text-center">
				<span className="h-1 w-10 rounded-full bg-gradient-to-r from-primary to-primary/30" />
				<h2 className="text-3xl font-bold tracking-tight">
					Everything attendance, in one system
				</h2>
				<p className="max-w-xl text-muted-foreground">
					From punch to payroll, handle the whole workflow without spreadsheets
					or chasing timesheets.
				</p>
			</div>
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				<FeatureCard
					icon={Timer}
					title="One-tap clock in / out"
					description="Employees clock in from any phone in seconds. Normal and afternoon shifts, with late and early-out detected automatically."
					className="sm:col-span-2"
				>
					<ClockMockup />
				</FeatureCard>
				<FeatureCard
					icon={CalendarDays}
					title="Leave management"
					description="Custom leave types with yearly quotas, live balances, and working-day accurate deductions."
				>
					<LeaveMockup />
				</FeatureCard>
				<FeatureCard
					icon={ClipboardCheck}
					title="Supervisor approvals"
					description="Leave requests and attendance justifications route to the right supervisor — with admin override and a full audit trail."
				>
					<ApprovalsMockup />
				</FeatureCard>
				<FeatureCard
					icon={BarChart3}
					title="Payroll-ready reports"
					description="A monthly summary per employee — presence, lateness, absences, and leave balances — exportable to CSV or PDF."
					className="sm:col-span-2"
				>
					<ReportsMockup />
				</FeatureCard>
			</div>
		</section>
	);
}

const steps = [
	{
		step: "1",
		title: "Create your workspace",
		description:
			"Sign up and set your working days, hours, and timezone in minutes — no hardware, no installers.",
	},
	{
		step: "2",
		title: "Add your team",
		description:
			"Create employee records, link their accounts, and set supervisors — or just key in attendance for staff without phones.",
	},
	{
		step: "3",
		title: "Track and export",
		description:
			"The team clocks in, leave flows through approvals, and you export payroll-ready reports at month end.",
	},
];

function HowItWorks() {
	return (
		<section
			id="how-it-works"
			className="scroll-mt-16 border-y bg-muted/40 py-24"
		>
			<div className="mx-auto w-full max-w-6xl px-6">
				<div className="mb-12 flex flex-col items-center gap-3 text-center">
					<span className="h-1 w-10 rounded-full bg-gradient-to-r from-primary to-primary/30" />
					<h2 className="text-3xl font-bold tracking-tight">
						Up and running in three steps
					</h2>
					<p className="max-w-xl text-muted-foreground">
						No hardware, no complex setup — start tracking attendance today.
					</p>
				</div>
				<div className="relative">
					<div
						aria-hidden
						className="absolute top-10 right-[16%] left-[16%] hidden h-px bg-gradient-to-r from-primary/30 via-primary/60 to-primary/30 md:block"
					/>
					<div className="relative grid gap-6 md:grid-cols-3">
						{steps.map((item) => (
							<div
								key={item.step}
								className="flex flex-col gap-2 rounded-lg border bg-background p-6"
							>
								<span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-sm font-semibold text-primary-foreground">
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
			</div>
		</section>
	);
}

const plans = [
	{
		name: "Free",
		price: "RM0",
		period: "/month",
		seats: "Up to 5 employees",
		bestFor: "For trying things out",
		popular: false,
	},
	{
		name: "Pro",
		price: "RM29",
		period: "/month",
		seats: "Up to 25 employees",
		bestFor: "For growing teams",
		popular: true,
	},
	{
		name: "Business",
		price: "RM59",
		period: "/month",
		seats: "Unlimited employees",
		bestFor: "For larger operations",
		popular: false,
	},
];

const planFeatures = [
	"Clock in / out with 2 shifts",
	"Leave types, quotas & balances",
	"Supervisor approvals",
	"Attendance issues & justifications",
	"Monthly reports (CSV & PDF)",
	"Mobile-friendly for the whole team",
];

function Pricing() {
	return (
		<section
			id="pricing"
			className="mx-auto w-full max-w-6xl scroll-mt-16 px-6 py-24"
		>
			<div className="mb-12 flex flex-col items-center gap-3 text-center">
				<span className="h-1 w-10 rounded-full bg-gradient-to-r from-primary to-primary/30" />
				<h2 className="text-3xl font-bold tracking-tight">
					Simple pricing in Ringgit
				</h2>
				<p className="max-w-xl text-muted-foreground">
					Every plan includes all features — the only difference is team size.
					Pay monthly via credit top-up, with 1, 3, 6, or 12 month terms.
				</p>
			</div>
			<div className="grid gap-6 md:grid-cols-3">
				{plans.map((plan) => (
					<div
						key={plan.name}
						className={
							plan.popular
								? "relative rounded-xl bg-gradient-to-b from-primary/60 via-primary/15 to-primary/5 p-[1.5px] shadow-lg md:-my-3"
								: "relative rounded-xl border"
						}
					>
						{plan.popular ? (
							<Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-primary to-primary/70 text-primary-foreground">
								Most popular
							</Badge>
						) : null}
						<div
							className={
								plan.popular
									? "flex h-full flex-col rounded-[10.5px] bg-card p-6"
									: "flex h-full flex-col p-6"
							}
						>
							<h3 className="font-semibold">{plan.name}</h3>
							<p className="text-sm text-muted-foreground">{plan.bestFor}</p>
							<p className="mt-4 flex items-baseline gap-1">
								<span
									className={
										plan.popular
											? "bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-4xl font-bold tracking-tight text-transparent"
											: "text-4xl font-bold tracking-tight"
									}
								>
									{plan.price}
								</span>
								<span className="text-sm text-muted-foreground">
									{plan.period}
								</span>
							</p>
							<p className="mt-1 text-sm font-medium">{plan.seats}</p>
							<Button
								className="mt-6 w-full"
								variant={plan.popular ? "default" : "outline"}
								asChild
							>
								<Link to="/signup">
									{plan.name === "Free" ? "Start free" : "Choose plan"}
								</Link>
							</Button>
						</div>
					</div>
				))}
			</div>
			<div className="mx-auto mt-10 flex max-w-3xl flex-wrap items-center justify-center gap-x-6 gap-y-2 rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
				<span className="font-medium text-foreground">
					Every plan includes:
				</span>
				{planFeatures.map((feature) => (
					<span key={feature} className="flex items-center gap-1.5">
						<Check className="size-3.5 text-primary" />
						{feature}
					</span>
				))}
			</div>
		</section>
	);
}

const faqs = [
	{
		question: "Is the free plan really free?",
		answer:
			"Yes. Free covers up to 5 employees with every core feature — clock in/out, leave management, approvals, and reports. No credit card required to sign up.",
	},
	{
		question: "How does billing work?",
		answer:
			"Subscriptions are paid from your credit balance. Top up whenever you like and choose a 1, 3, 6, or 12 month term. Cancel anytime — you keep access until the end of the paid term, then drop back to Free.",
	},
	{
		question: "Does it work on phones?",
		answer:
			"Yes — the whole system is mobile-first. Employees clock in and apply for leave from their phones; supervisors approve from theirs. No app install needed, any modern browser works.",
	},
	{
		question: "Can I export data for payroll?",
		answer:
			"The monthly summary report shows per-employee presence, lateness, absences, and leave balances — download it as CSV or print it to PDF for your payroll provider.",
	},
	{
		question: "How long does setup take?",
		answer:
			"Most teams are running the same day: create your workspace, add employee records, and share the login page. Staff without accounts can still be tracked via admin key-in.",
	},
];

function Faq() {
	return (
		<section
			id="faq"
			className="mx-auto w-full max-w-3xl scroll-mt-16 px-6 pb-24"
		>
			<div className="mb-10 flex flex-col items-center gap-3 text-center">
				<span className="h-1 w-10 rounded-full bg-gradient-to-r from-primary to-primary/30" />
				<h2 className="text-3xl font-bold tracking-tight">
					Frequently asked questions
				</h2>
			</div>
			<Accordion
				type="single"
				collapsible
				className="divide-y rounded-lg border"
			>
				{faqs.map((faq) => (
					<AccordionItem key={faq.question} value={faq.question}>
						<AccordionTrigger className="px-4 hover:no-underline">
							{faq.question}
						</AccordionTrigger>
						<AccordionContent className="px-4 text-muted-foreground">
							{faq.answer}
						</AccordionContent>
					</AccordionItem>
				))}
			</Accordion>
		</section>
	);
}

function CtaBand() {
	return (
		<section className="mx-auto w-full max-w-6xl px-6 py-24">
			<div className="flex flex-col items-center gap-6 rounded-2xl border bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-12 text-center">
				<h2 className="text-3xl font-bold tracking-tight">
					Ready to simplify attendance?
				</h2>
				<p className="max-w-xl text-muted-foreground">
					Start free with up to 5 employees — upgrade only when your team grows.
				</p>
				<Button size="lg" asChild>
					<Link to="/signup">Create your workspace</Link>
				</Button>
			</div>
		</section>
	);
}

function SiteFooter() {
	return (
		<footer className="border-t">
			<div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground sm:flex-row">
				<div className="flex items-center gap-2">
					<span className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
						<CalendarCheck className="size-3" />
					</span>
					<span className="font-medium text-foreground">
						Attendance Management System
					</span>
				</div>
				<nav className="flex gap-6">
					<a href="#features" className="hover:text-foreground">
						Features
					</a>
					<a href="#how-it-works" className="hover:text-foreground">
						How it works
					</a>
					<a href="#pricing" className="hover:text-foreground">
						Pricing
					</a>
					<a href="#faq" className="hover:text-foreground">
						FAQ
					</a>
				</nav>
				<p>© {new Date().getFullYear()} · Built for Malaysian SMEs</p>
			</div>
		</footer>
	);
}
