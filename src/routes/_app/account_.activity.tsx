import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { listMyActivity } from "#/lib/auth.functions";
import {
	AUDIT_ACTION_LABELS,
	AUDIT_TONE_CLASS,
} from "#/lib/audit-labels";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";

export const Route = createFileRoute("/_app/account_/activity")({
	staticData: { title: "My activity" },
	component: ActivityPage,
});



function ActivityPage() {
	const activityQuery = useQuery({
		queryKey: ["account", "activity"],
		queryFn: listMyActivity,
	});
	const logs = activityQuery.data ?? [];

	return (
		<div className="flex flex-col gap-4">
			<Card>
				<CardHeader>
					<CardTitle>My activity</CardTitle>
					<CardDescription>
						Recent security, leave, issue and billing events involving your
						account — latest first.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{activityQuery.isPending ? (
						<p className="text-sm text-muted-foreground">Loading…</p>
					) : activityQuery.isError ? (
						<p className="text-sm text-destructive">Failed to load activity.</p>
					) : logs.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							No activity recorded yet.
						</p>
					) : (
						<ul className="flex flex-col divide-y">
							{logs.map((log) => {
								const config = {
									label:
										AUDIT_ACTION_LABELS[log.action]?.label ?? log.action,
									tone: AUDIT_TONE_CLASS[log.action] ?? "text-foreground",
								};
								return (
									<li
										key={log.id}
										className="flex items-start justify-between gap-3 py-2"
									>
										<div className="min-w-0">
											<p className={`text-sm font-medium ${config.tone}`}>
												{config.label}
											</p>
											{log.detail ? (
												<p className="truncate text-xs text-muted-foreground">
													{log.detail}
												</p>
											) : null}
										</div>
										<span className="shrink-0 text-xs tabular-nums text-muted-foreground">
											{new Date(log.createdAt).toLocaleString("en-MY", {
												day: "numeric",
												month: "short",
												hour: "2-digit",
												minute: "2-digit",
											})}
										</span>
									</li>
								);
							})}
						</ul>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
