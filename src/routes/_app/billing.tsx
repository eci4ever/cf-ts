import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { ArrowDownRight, ArrowUpRight, Wallet } from "lucide-react";
import { useState } from "react";
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
import {
	getBillingOverview,
	getPaymentInstructions,
	listMyTopupRequests,
	type SubscriptionState,
	subscribePlan,
	requestTopup,
} from "#/lib/billing.functions";
import { getMyOrgRole } from "#/lib/org.functions";
import {
	formatRm,
	type LedgerType,
	PAID_PLANS,
	PLANS,
	type PlanId,
	parseRmToSen,
	SUBSCRIPTION_MONTHS,
} from "#/lib/subscription";

export const Route = createFileRoute("/_app/billing")({
	staticData: { title: "Billing" },
	beforeLoad: async () => {
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
	const queryClient = useQueryClient();
	const overviewQuery = useQuery({
		queryKey: ["billing", "overview"],
		queryFn: getBillingOverview,
	});

	if (overviewQuery.isError) {
		return <p className="text-sm text-destructive">Failed to load billing.</p>;
	}
	if (overviewQuery.isPending || !overviewQuery.data) {
		return <p className="text-sm text-muted-foreground">Loading billing…</p>;
	}

	const overview = {
		...overviewQuery.data,
		ledger: overviewQuery.data.ledger as LedgerRow[],
	};
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
							onDone={() =>
								queryClient.invalidateQueries({ queryKey: ["billing"] })
							}
						/>
					))}
				</CardContent>
			</Card>

			<PaymentInstructionsCard />
			<TopupRequestsCard />

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
	onDone: () => void;
}) {
	const queryClient = useQueryClient();
	const plan = PLANS[planId];
	const isCurrent = state.plan === planId;
	const isPending = state.pendingPlan === planId;
	const isActive =
		state.plan !== "free" &&
		state.paidUntil !== null &&
		state.paidUntil.getTime() > Date.now();
	const [months, setMonths] = useState<number>(1);
	const subscribeMutation = useMutation({
		mutationFn: async (input: { planId: PlanId; months: number }) => {
			const result = await subscribePlan({ data: input });
			if (!result.ok) {
				throw new Error(result.reason);
			}
			return result;
		},
		onSuccess: (result) => {
			if (result.scheduled) {
				toast.success(`${plan.name} scheduled — takes effect at next renewal`);
			} else {
				toast.success(
					`${plan.name} active for ${months} month${months > 1 ? "s" : ""}`,
				);
			}
			queryClient.invalidateQueries({ queryKey: ["billing"] });
			onDone();
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});

	function handleSubscribe() {
		subscribeMutation.mutate({ planId, months });
	}

	const pending = subscribeMutation.isPending;

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

type TopupRequestRow = {
	id: string;
	amountSen: number;
	paymentRef: string;
	status: string;
	decisionNote: string | null;
	createdAt: Date | string;
};

function RequestTopupButton() {
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [amount, setAmount] = useState("");
	const [paymentRef, setPaymentRef] = useState("");
	const instructionsQuery = useQuery({
		queryKey: ["billing", "payment-instructions"],
		queryFn: getPaymentInstructions,
		enabled: open,
	});
	const requestMutation = useMutation({
		mutationFn: async (input: { amountSen: number; paymentRef: string }) => {
			const result = await requestTopup({ data: input });
			if (!result.ok) {
				throw new Error(result.reason);
			}
			return result;
		},
		onSuccess: () => {
			toast.success("Top-up request submitted");
			setOpen(false);
			setAmount("");
			setPaymentRef("");
			queryClient.invalidateQueries({ queryKey: ["billing"] });
		},
		onError: (error) => toast.error(error.message),
	});

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const amountSen = parseRmToSen(amount);
		if (amountSen === null || amountSen < 1000) {
			toast.error("Minimum top-up is RM10");
			return;
		}
		requestMutation.mutate({ amountSen, paymentRef });
	}

	const instructions = instructionsQuery.data ?? null;

	return (
		<>
			<Button size="sm" onClick={() => setOpen(true)}>
				<Wallet />
				Request top-up
			</Button>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>Request credit top-up</DialogTitle>
						<DialogDescription>
							Transfer the amount by manual bank transfer, then submit this
							request with your payment reference. The platform administrator
							will verify it against the bank statement and approve.
						</DialogDescription>
					</DialogHeader>
					{instructions ? (
						<div className="flex flex-col gap-3 rounded-md border bg-muted/40 p-3">
							<p className="text-sm font-medium">Payment instructions</p>
							<div className="grid gap-1 text-sm">
								{instructions.bankName ? (
									<p>
										<span className="text-muted-foreground">Bank: </span>
										{instructions.bankName}
									</p>
								) : null}
								{instructions.bankAccount ? (
									<p>
										<span className="text-muted-foreground">Account no: </span>
										<span className="font-mono">{instructions.bankAccount}</span>
									</p>
								) : null}
								{instructions.accountHolder ? (
									<p>
										<span className="text-muted-foreground">Holder: </span>
										{instructions.accountHolder}
									</p>
								) : null}
							</div>
							{instructions.qrBase64 ? (
								<img
									src={instructions.qrBase64}
									alt="DuitNow QR"
									className="h-40 w-40 self-center rounded border bg-white object-contain p-1"
								/>
							) : null}
							{instructions.contactEmail ? (
								<p className="text-xs text-muted-foreground">
									After transferring, email your payment proof to{" "}
									<span className="font-medium text-foreground">
										{instructions.contactEmail}
									</span>{" "}
									— include your organization name and the payment reference you
									enter below.
								</p>
							) : null}
						</div>
					) : null}
					<form onSubmit={handleSubmit} className="flex flex-col gap-4">
						<div className="flex flex-col gap-2">
							<Label htmlFor="topup-amount">Amount (RM)</Label>
							<Input
								id="topup-amount"
								inputMode="decimal"
								placeholder="100.00"
								value={amount}
								onChange={(event) => setAmount(event.target.value)}
								required
							/>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="topup-ref">Payment reference</Label>
							<Input
								id="topup-ref"
								value={paymentRef}
								onChange={(event) => setPaymentRef(event.target.value)}
								placeholder="e.g. FT1234567890 or your company name"
								required
								minLength={3}
								maxLength={60}
							/>
						</div>
						<DialogFooter>
							<Button type="submit" disabled={requestMutation.isPending}>
								{requestMutation.isPending ? "Submitting…" : "Submit request"}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</>
	);
}

function PaymentInstructionsCard() {
	const instructionsQuery = useQuery({
		queryKey: ["billing", "payment-instructions"],
		queryFn: getPaymentInstructions,
	});
	const instructions = instructionsQuery.data ?? null;
	return (
		<Card>
			<CardHeader className="flex-row items-start justify-between gap-2">
				<div className="space-y-1.5">
					<CardTitle>Payment instructions</CardTitle>
					<CardDescription>
						Transfer by manual bank transfer, then submit a top-up request with
						your payment reference
					</CardDescription>
				</div>
				<RequestTopupButton />
			</CardHeader>
			<CardContent className="text-sm">
				{instructions &&
				(instructions.bankAccount || instructions.bankName) ? (
					<div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
						<div className="grid gap-1">
							{instructions.bankName ? (
								<p>
									<span className="text-muted-foreground">Bank: </span>
									{instructions.bankName}
								</p>
							) : null}
							{instructions.bankAccount ? (
								<p>
									<span className="text-muted-foreground">Account no: </span>
									<span className="font-mono">{instructions.bankAccount}</span>
								</p>
							) : null}
							{instructions.accountHolder ? (
								<p>
									<span className="text-muted-foreground">Holder: </span>
									{instructions.accountHolder}
								</p>
							) : null}
						</div>
						{instructions.qrBase64 ? (
							<img
								src={instructions.qrBase64}
								alt="DuitNow QR"
								className="size-28 rounded border bg-white object-contain p-1"
							/>
						) : null}
					</div>
				) : (
					<p className="text-muted-foreground">
						Bank account details will appear here once the platform
						administrator configures them.
					</p>
				)}
				{instructions?.contactEmail ? (
					<p className="mt-3 text-xs text-muted-foreground">
						Email your payment proof to{" "}
						<span className="font-medium text-foreground">
							{instructions.contactEmail}
						</span>{" "}
						with your organization name and payment reference. The platform
						administrator will verify and approve — your balance updates
						automatically once approved.
					</p>
				) : null}
			</CardContent>
		</Card>
	);
}

function TopupRequestsCard() {
	const requestsQuery = useQuery({
		queryKey: ["billing", "topup-requests"],
		queryFn: listMyTopupRequests,
	});
	const requests = (requestsQuery.data ?? []) as TopupRequestRow[];
	if (requestsQuery.isPending) {
		return null;
	}
	return (
		<Card>
			<CardHeader>
				<CardTitle>My top-up requests</CardTitle>
				<CardDescription>Latest requests and their outcomes</CardDescription>
			</CardHeader>
			<CardContent>
				{requests.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						No top-up requests yet.
					</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Date</TableHead>
								<TableHead>Amount</TableHead>
								<TableHead>Reference</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>Note</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{requests.map((request) => (
								<TableRow key={request.id}>
									<TableCell>
										{new Date(request.createdAt).toLocaleDateString()}
									</TableCell>
									<TableCell>{formatRm(request.amountSen)}</TableCell>
									<TableCell>{request.paymentRef}</TableCell>
									<TableCell>
										<Badge
											variant={
												request.status === "approved"
													? "outline"
													: request.status === "rejected"
														? "destructive"
														: "secondary"
											}
										>
											{request.status}
										</Badge>
									</TableCell>
									<TableCell className="text-muted-foreground">
										{request.decisionNote ?? "—"}
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
