import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { BarChart3, CalendarCheck, CalendarDays, Zap } from "lucide-react";

const highlights = [
	{ icon: Zap, text: "Clock in from any phone in seconds" },
	{ icon: CalendarDays, text: "Leave with quotas, balances, and approvals" },
	{ icon: BarChart3, text: "Payroll-ready monthly reports" },
];

export function AuthShell({
	title,
	description,
	children,
}: {
	title: string;
	description: ReactNode;
	children: ReactNode;
}) {
	return (
		<main className="grid min-h-svh lg:grid-cols-2">
			<div className="relative hidden flex-col justify-between overflow-hidden bg-muted/40 p-10 lg:flex">
				<div
					aria-hidden
					className="absolute inset-0 bg-gradient-to-br from-primary/15 via-transparent to-primary/5"
				/>
				<div
					aria-hidden
					className="absolute -top-32 -left-32 size-96 rounded-full bg-primary/15 blur-3xl"
				/>
				<div
					aria-hidden
					className="absolute -right-32 -bottom-32 size-96 rounded-full bg-primary/10 blur-3xl"
				/>
				<Link to="/" className="relative flex items-center gap-2">
					<span className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/70 text-primary-foreground">
						<CalendarCheck className="size-5" />
					</span>
					<span className="font-semibold tracking-tight">
						Attendance Management System
					</span>
				</Link>
				<div className="relative flex flex-col gap-8">
					<h2 className="max-w-md text-balance text-3xl font-bold tracking-tight">
						Attendance &amp; leave,{" "}
						<span className="bg-gradient-to-r from-primary to-primary/50 bg-clip-text text-transparent">
							without the busywork
						</span>
					</h2>
					<ul className="flex flex-col gap-3">
						{highlights.map((item) => (
							<li key={item.text} className="flex items-center gap-3 text-sm">
								<span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-primary/15 to-primary/5 text-primary">
									<item.icon className="size-3.5" />
								</span>
								<span className="text-muted-foreground">{item.text}</span>
							</li>
						))}
					</ul>
				</div>
				<p className="relative text-xs text-muted-foreground">
					© {new Date().getFullYear()} · Built for Malaysian SMEs
				</p>
			</div>
			<div className="relative flex items-center justify-center p-6">
				<div
					aria-hidden
					className="pointer-events-none absolute top-0 left-1/2 h-64 w-96 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl lg:hidden"
				/>
				<div className="relative w-full max-w-sm">
					<Link
						to="/"
						aria-label="Back to home"
						className="mb-6 flex size-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/70 text-primary-foreground lg:hidden"
					>
						<CalendarCheck className="size-5" />
					</Link>
					<h1 className="text-2xl font-bold tracking-tight">{title}</h1>
					<p className="mt-1 text-sm text-muted-foreground">{description}</p>
					<div className="mt-6">{children}</div>
				</div>
			</div>
		</main>
	);
}
