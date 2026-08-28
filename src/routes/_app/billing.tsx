import { createFileRoute, redirect } from "@tanstack/react-router";
import { ArrowDownRight, ArrowUpRight, Wallet } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
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
import { getSession } from "#/lib/auth.functions";
import {
	getBillingOverview,
	type SubscriptionState,
	subscribePlan,
} from "#/lib/billing.functions";
import { getMyOrgRole } from "#/lib/org.functions";
import {
	formatRm,
	type LedgerType,
	PAID_PLANS,
	PLANS,
	type PlanId,
	SUBSCRIPTION_MONTHS,
} from "#/lib/subscription";

export const Route = createFileRoute("/_app/billing")({
	staticData: { title: "Billing" },
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
	component: BillingPage,
});

type LedgerRow = {
	id: string;
	type: LedgerType;
	amountSen: number;
	balanceAfterSen: number;
	note: string | null;
	createdAt: Date;
};

function BillingPage() {
	const [overview, setOverview] = useState<{
		name: string;
		state: SubscriptionState;
		ledger: LedgerRow[];
	} | null>(null);
	const [loading, setLoading] = useState(true);

	const loadOverview = useCallback(async () => {
		setLoading(true);
		const data = await getBillingOverview();
		setOverview({ ...data, ledger: data.ledger as LedgerRow[] });
		setLoading(false);
	}, []);

	useEffect(() => {
		loadOverview();
	}, [loadOverview]);

	if (loading || !overview) {
		return <p className="text-sm text-muted-foreground">Loading billing…</p>;
	}

	const { state, ledger } = overview;

	return (
		<div className="flex flex-col gap-4">
			<div className="grid gap-4 sm:grid-cols-2">
				<Card>
					<CardHeader className="flex-row items-center justify-between space-y-0">
						<CardDescription>Credit balance</CardDescription>
						<Wallet className="size-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<CardTitle className="text-3xl">
							{formatRm(state.balanceSen)}
						</CardTitle>
						<p className="mt-1 text-xs text-muted-foreground">
							Top up manually — see payment instructions below
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="flex-row items-center justify-between space-y-0">
						<CardDescription>Current plan</CardDescription>
						<Badge variant={state.plan === "free" ? "secondary" : "outline"}>
							{PLANS[state.plan].name}
						</Badge>
					</CardHeader>
					<CardContent>
						<CardTitle className="text-3xl">
							{state.paidUntil ? state.paidUntil.toLocaleDateString() : "—"}
						</CardTitle>
						<p className="mt-1 text-xs text-muted-foreground">
							{state.plan === "free" ? "Free plan — no expiry" : "Paid until"}
						</p>
						{state.pendingPlan ? (
							<p className="mt-1 text-xs text-muted-foreground">
								Pending change to {PLANS[state.pendingPlan].name} at next
								renewal
							</p>
						) : null}
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Plans</CardTitle>
					<CardDescription>
						{state.pendingPlan
							? "Your plan change takes effect at the next renewal."
							: "Plan changes made while a subscription is active take effect at the next renewal."}
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-4 sm:grid-cols-3">
					{(["free", ...PAID_PLANS] as PlanId[]).map((planId) => (
						<PlanCard
							key={planId}
							planId={planId}
							state={state}
							onDone={loadOverview}
						/>
					))}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Payment instructions</CardTitle>
					<CardDescription>
						Credits are topped up manually by the administrator
					</CardDescription>
				</CardHeader>
				<CardContent className="text-sm text-muted-foreground">
					<p>
						Make a bank transfer to the account provided by the administrator,
						then contact them with your proof of payment. Credits will appear in
						your balance once confirmed.
					</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Transactions</CardTitle>
				</CardHeader>
				<CardContent>
					{ledger.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							No transactions yet.
						</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Date</TableHead>
									<TableHead>Type</TableHead>
									<TableHead>Amount</TableHead>
									<TableHead>Balance after</TableHead>
									<TableHead>Note</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{ledger.map((entry) => (
									<TableRow key={entry.id}>
										<TableCell>
											{new Date(entry.createdAt).toLocaleDateString()}
										</TableCell>
										<TableCell>
											<Badge
												variant={entry.amountSen > 0 ? "outline" : "secondary"}
											>
												{entry.type.replace(/_/g, " ")}
											</Badge>
										</TableCell>
										<TableCell
											className={
												entry.amountSen > 0
													? "font-medium"
													: "font-medium text-destructive"
											}
										>
											<span className="flex items-center gap-1">
												{entry.amountSen > 0 ? (
													<ArrowUpRight className="size-3" />
												) : (
													<ArrowDownRight className="size-3" />
												)}
												{formatRm(Math.abs(entry.amountSen))}
											</span>
										</TableCell>
										<TableCell>{formatRm(entry.balanceAfterSen)}</TableCell>
										<TableCell className="max-w-48 truncate text-muted-foreground">
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

function PlanCard({
	planId,
	state,
	onDone,
}: {
	planId: PlanId;
	state: SubscriptionState;
	onDone: () => Promise<void>;
}) {
	const plan = PLANS[planId];
	const isCurrent = state.plan === planId;
	const isPending = state.pendingPlan === planId;
	const isActive =
		state.plan !== "free" &&
		state.paidUntil !== null &&
		state.paidUntil.getTime() > Date.now();
	const [months, setMonths] = useState<number>(1);
	const [pending, setPending] = useState(false);

	async function handleSubscribe() {
		setPending(true);
		const result = await subscribePlan({ data: { planId, months } });
		setPending(false);

		if (!result.ok) {
			toast.error(result.reason);
			return;
		}
		if (result.scheduled) {
			toast.success(`${plan.name} scheduled — takes effect at next renewal`);
		} else {
			toast.success(
				`${plan.name} active for ${months} month${months > 1 ? "s" : ""}`,
			);
		}
		await onDone();
	}

	const buttonLabel = (() => {
		if (pending) {
			return "Processing…";
		}
		if (planId === "free") {
			return isActive ? "Downgrade at renewal" : "Current plan";
		}
		if (isPending) {
			return "Scheduled";
		}
		if (isActive && isCurrent) {
			return "Extend";
		}
		if (isActive) {
			return "Schedule at renewal";
		}
		return "Subscribe";
	})();

	const canAct =
		!pending &&
		!isPending &&
		!(planId === "free" && !isActive) &&
		!(isCurrent && planId === "free");

	return (
		<div
			className={`flex flex-col gap-3 rounded-lg border p-4 ${
				isCurrent || isPending ? "border-primary" : ""
			}`}
		>
			<div className="flex items-center justify-between">
				<p className="font-semibold">{plan.name}</p>
				{isCurrent ? <Badge variant="outline">Current</Badge> : null}
				{isPending ? <Badge variant="secondary">Scheduled</Badge> : null}
			</div>
			<p className="text-2xl font-semibold">
				{plan.priceSen === 0 ? "Free" : formatRm(plan.priceSen)}
				{plan.priceSen > 0 ? (
					<span className="text-sm font-normal text-muted-foreground">
						{" "}
						/month
					</span>
				) : null}
			</p>
			<p className="text-sm text-muted-foreground">
				{plan.maxEmployees === null
					? "Unlimited employees"
					: `Up to ${plan.maxEmployees} employees`}
			</p>
			{planId === "free" ? null : (
				<Select
					value={String(months)}
					onValueChange={(value) => setMonths(Number(value))}
				>
					<SelectTrigger className="w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							{SUBSCRIPTION_MONTHS.map((count) => (
								<SelectItem key={count} value={String(count)}>
									{count} month{count > 1 ? "s" : ""} —{" "}
									{formatRm(plan.priceSen * count)}
								</SelectItem>
							))}
						</SelectGroup>
					</SelectContent>
				</Select>
			)}
			<Button
				variant={isCurrent && planId === "free" ? "secondary" : "default"}
				disabled={!canAct}
				onClick={handleSubscribe}
			>
				{buttonLabel}
			</Button>
		</div>
	);
}
