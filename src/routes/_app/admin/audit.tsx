import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
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
import { listOrgBilling } from "#/lib/billing.functions";
import {
	listPlatformAuditLogs,
	PLATFORM_AUDIT_ACTION_KEYS,
} from "#/lib/auth.functions";
import {
	AUDIT_ACTION_LABELS,
	AUDIT_TONE_CLASS,
} from "#/lib/audit-labels";

export const Route = createFileRoute("/_app/admin/audit")({
	staticData: { title: "Audit log" },
	component: AdminAuditPage,
});

type AuditRow = {
	id: string;
	createdAt: Date | string;
	action: string;
	detail: string | null;
	orgName: string | null;
	actorName: string | null;
	actorEmail: string | null;
	targetName: string | null;
};

function AdminAuditPage() {
	const [orgFilter, setOrgFilter] = useState<string>("all");
	const [actionFilter, setActionFilter] = useState<string>("all");

	const orgsQuery = useQuery({
		queryKey: ["admin", "orgs"],
		queryFn: listOrgBilling,
	});
	const logsQuery = useQuery({
		queryKey: ["admin", "audit", orgFilter, actionFilter],
		queryFn: () =>
			listPlatformAuditLogs({
				data: {
					organizationId: orgFilter === "all" ? null : orgFilter,
					action: actionFilter === "all" ? null : actionFilter,
				},
			}),
	});
	const logs = (logsQuery.data ?? []) as AuditRow[];
	const orgs = orgsQuery.data ?? [];

	return (
		<Card>
			<CardHeader>
				<CardTitle>Audit log</CardTitle>
				<CardDescription>
					Security, leave, issue, settings and billing events across all
					organizations — latest 100
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<div className="flex flex-wrap items-end gap-2">
					<div className="flex flex-col gap-2">
						<Label htmlFor="audit-org">Organization</Label>
						<Select value={orgFilter} onValueChange={setOrgFilter}>
							<SelectTrigger id="audit-org" className="h-9 w-56">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									<SelectItem value="all">All organizations</SelectItem>
									{orgs.map((org) => (
										<SelectItem key={org.id} value={org.id}>
											{org.name}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="audit-action">Action</Label>
						<Select value={actionFilter} onValueChange={setActionFilter}>
							<SelectTrigger id="audit-action" className="h-9 w-56">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									<SelectItem value="all">All actions</SelectItem>
									{PLATFORM_AUDIT_ACTION_KEYS.map((key) => (
										<SelectItem key={key} value={key}>
											{AUDIT_ACTION_LABELS[key]?.label ?? key}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
					</div>
				</div>
				{logsQuery.isPending ? (
					<p className="text-sm text-muted-foreground">Loading…</p>
				) : logsQuery.isError ? (
					<p className="text-sm text-destructive">Failed to load audit log.</p>
				) : logs.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						No audit entries match the filters.
					</p>
				) : (
					<div className="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Time</TableHead>
									<TableHead>Organization</TableHead>
									<TableHead>Actor</TableHead>
									<TableHead>Action</TableHead>
									<TableHead>Involves</TableHead>
									<TableHead>Detail</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{logs.map((log) => (
									<TableRow key={log.id}>
										<TableCell className="whitespace-nowrap tabular-nums">
											{new Date(log.createdAt).toLocaleString("en-MY", {
												day: "numeric",
												month: "short",
												hour: "2-digit",
												minute: "2-digit",
											})}
										</TableCell>
										<TableCell>{log.orgName ?? "—"}</TableCell>
										<TableCell>
											{log.actorName ?? "—"}
											<span className="block text-xs text-muted-foreground">
												{log.actorEmail ?? ""}
											</span>
										</TableCell>
										<TableCell>
											<span
												className={
													AUDIT_TONE_CLASS[log.action] ?? "text-foreground"
												}
											>
												{AUDIT_ACTION_LABELS[log.action]?.label ?? log.action}
											</span>
										</TableCell>
										<TableCell>{log.targetName ?? "—"}</TableCell>
										<TableCell className="max-w-72 text-sm text-muted-foreground">
											{log.detail ?? "—"}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
