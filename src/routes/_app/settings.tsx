import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { AlertTriangle, Crown, Settings as SettingsIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "#/components/ui/alert-dialog";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
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
import { getSession } from "#/lib/auth.functions";
import { getMyOrgRole } from "#/lib/org.functions";
import {
	deleteCurrentOrg,
	getOrgSettings,
	transferOwnership,
	updateOrgName,
} from "#/lib/org-settings.functions";

export const Route = createFileRoute("/_app/settings")({
	staticData: { title: "Settings" },
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
	component: SettingsPage,
});

type MemberRow = {
	userId: string;
	name: string;
	email: string;
	role: string;
	joinedAt: Date;
};

function SettingsPage() {
	const router = useRouter();
	const [settings, setSettings] = useState<{
		name: string;
		slug: string;
		role: string;
		currentUserId: string;
		members: MemberRow[];
	} | null>(null);
	const [loading, setLoading] = useState(true);

	const loadSettings = useCallback(async () => {
		setLoading(true);
		const data = await getOrgSettings();
		setSettings(data);
		setLoading(false);
	}, []);

	useEffect(() => {
		loadSettings();
	}, [loadSettings]);

	if (loading || !settings) {
		return <p className="text-sm text-muted-foreground">Loading settings…</p>;
	}

	const isOwner = settings.role === "owner";

	return (
		<div className="flex flex-col gap-4">
			<GeneralCard
				name={settings.name}
				slug={settings.slug}
				onSaved={loadSettings}
			/>
			{isOwner ? (
				<>
					<TransferOwnershipCard
						currentUserId={settings.currentUserId}
						members={settings.members}
						onDone={async () => {
							await router.invalidate();
							await loadSettings();
						}}
					/>
					<DangerZoneCard
						orgName={settings.name}
						onDeleted={async () => {
							toast.success("Organization deleted");
							await router.invalidate();
							await router.navigate({ to: "/onboarding" });
						}}
					/>
				</>
			) : (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-base">
							<AlertTriangle />
							Ownership actions
						</CardTitle>
						<CardDescription>
							Transferring ownership and deleting the organization can only be
							performed by the owner.
						</CardDescription>
					</CardHeader>
				</Card>
			)}
		</div>
	);
}

function GeneralCard({
	name,
	slug,
	onSaved,
}: {
	name: string;
	slug: string;
	onSaved: () => Promise<void>;
}) {
	const [value, setValue] = useState(name);
	const [pending, setPending] = useState(false);

	useEffect(() => {
		setValue(name);
	}, [name]);

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setPending(true);
		const result = await updateOrgName({ data: { name: value } });
		setPending(false);

		if (!result.ok) {
			toast.error(result.reason);
			return;
		}
		toast.success("Organization name updated");
		await onSaved();
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<SettingsIcon />
					General
				</CardTitle>
				<CardDescription>Organization identity details</CardDescription>
			</CardHeader>
			<CardContent>
				<form onSubmit={handleSubmit} className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<Label htmlFor="org-name">Organization name</Label>
						<Input
							id="org-name"
							value={value}
							onChange={(event) => setValue(event.target.value)}
							required
							minLength={2}
							maxLength={80}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label>Slug</Label>
						<p className="text-sm text-muted-foreground">{slug}</p>
					</div>
					<Button type="submit" disabled={pending} className="w-fit">
						{pending ? "Saving..." : "Save changes"}
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}

function TransferOwnershipCard({
	currentUserId,
	members,
	onDone,
}: {
	currentUserId: string;
	members: MemberRow[];
	onDone: () => Promise<void>;
}) {
	const router = useRouter();
	const [target, setTarget] = useState<string>("");
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [pending, setPending] = useState(false);

	const candidates = members.filter(
		(member) => member.userId !== currentUserId && member.role !== "owner",
	);

	async function handleTransfer() {
		if (!target) {
			return;
		}
		setPending(true);
		const result = await transferOwnership({ data: { targetUserId: target } });
		setPending(false);
		setConfirmOpen(false);

		if (!result.ok) {
			toast.error(result.reason);
			return;
		}
		toast.success("Ownership transferred — you are now an admin");
		setTarget("");
		await router.invalidate();
		await onDone();
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Crown />
					Transfer ownership
				</CardTitle>
				<CardDescription>
					You will become an admin and the selected member becomes the owner
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="flex flex-col gap-4 sm:flex-row sm:items-end">
					<div className="flex flex-1 flex-col gap-2">
						<Label htmlFor="transfer-target">New owner</Label>
						<Select value={target} onValueChange={setTarget}>
							<SelectTrigger id="transfer-target" className="w-full">
								<SelectValue placeholder="Select a member" />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									{candidates.map((member) => (
										<SelectItem key={member.userId} value={member.userId}>
											{member.name} ({member.email}) — {member.role}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
					</div>
					<AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
						<AlertDialogTrigger asChild>
							<Button
								variant="outline"
								disabled={!target || candidates.length === 0}
							>
								Transfer ownership
							</Button>
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>Transfer ownership?</AlertDialogTitle>
								<AlertDialogDescription>
									You will lose owner privileges and become an admin. This can
									only be undone by the new owner.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>Cancel</AlertDialogCancel>
								<AlertDialogAction asChild>
									<Button onClick={handleTransfer} disabled={pending}>
										{pending ? "Transferring..." : "Transfer"}
									</Button>
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</div>
				{candidates.length === 0 ? (
					<p className="mt-3 text-sm text-muted-foreground">
						No other members available. Invite teammates first.
					</p>
				) : null}
			</CardContent>
		</Card>
	);
}

function DangerZoneCard({
	orgName,
	onDeleted,
}: {
	orgName: string;
	onDeleted: () => Promise<void>;
}) {
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [confirmation, setConfirmation] = useState("");
	const [pending, setPending] = useState(false);

	async function handleDelete() {
		if (confirmation !== orgName) {
			toast.error(`Type "${orgName}" exactly to confirm deletion`);
			return;
		}
		setPending(true);
		const result = await deleteCurrentOrg();
		setPending(false);

		if (!result.ok) {
			toast.error("Failed to delete organization");
			return;
		}
		setConfirmOpen(false);
		await onDeleted();
	}

	return (
		<Card className="border-destructive/50">
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-destructive">
					<AlertTriangle />
					Danger zone
				</CardTitle>
				<CardDescription>
					Deleting the organization removes all members, invitations, credit
					history and subscription data — permanently. Members with an active
					session are returned to onboarding.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
					<AlertDialogTrigger asChild>
						<Button variant="destructive">Delete organization</Button>
					</AlertDialogTrigger>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Delete {orgName} permanently?</AlertDialogTitle>
							<AlertDialogDescription>
								This cannot be undone. Type the organization name{" "}
								<strong>{orgName}</strong> to confirm.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<div className="flex flex-col gap-2">
							<Label htmlFor="delete-confirmation">Organization name</Label>
							<Input
								id="delete-confirmation"
								value={confirmation}
								onChange={(event) => setConfirmation(event.target.value)}
								placeholder={orgName}
							/>
						</div>
						<AlertDialogFooter>
							<AlertDialogCancel
								onClick={() => {
									setConfirmation("");
								}}
							>
								Cancel
							</AlertDialogCancel>
							<AlertDialogAction asChild>
								<Button
									variant="destructive"
									disabled={pending || confirmation !== orgName}
									onClick={handleDelete}
								>
									{pending ? "Deleting..." : "Delete permanently"}
								</Button>
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</CardContent>
		</Card>
	);
}
