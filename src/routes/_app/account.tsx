import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, KeyRound, ShieldCheck, X, XCircle } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useState } from "react";
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
	DialogTrigger,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Switch } from "#/components/ui/switch";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { authClient } from "#/lib/auth-client";

export const Route = createFileRoute("/_app/account")({
	staticData: { title: "Account" },
	component: AccountPage,
});

type SessionRow = NonNullable<
	Awaited<ReturnType<typeof authClient.listSessions>>["data"]
>[number];

function AccountPage() {
	const { data: session, refetch: refetchSession } = authClient.useSession();
	const user = session?.user;

	return (
		<Tabs defaultValue="profile" className="gap-4">
			<TabsList>
				<TabsTrigger value="profile">Profile</TabsTrigger>
				<TabsTrigger value="security">Security</TabsTrigger>
				<TabsTrigger value="sessions">Sessions</TabsTrigger>
			</TabsList>
			<TabsContent value="profile">
				<ProfileTab
					name={user?.name ?? ""}
					image={user?.image ?? ""}
					email={user?.email ?? ""}
					emailVerified={user?.emailVerified ?? false}
				/>
			</TabsContent>
			<TabsContent value="security">
				<SecurityTab
					twoFactorEnabled={user?.twoFactorEnabled ?? false}
					refetchSession={refetchSession}
				/>
			</TabsContent>
			<TabsContent value="sessions">
				<SessionsTab currentToken={session?.session.token ?? ""} />
			</TabsContent>
		</Tabs>
	);
}

function ProfileTab({
	name,
	image,
	email,
	emailVerified,
}: {
	name: string;
	image: string;
	email: string;
	emailVerified: boolean;
}) {
	const [displayName, setDisplayName] = useState(name);
	const [imageUrl, setImageUrl] = useState(image);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);

	useEffect(() => {
		setDisplayName(name);
		setImageUrl(image);
	}, [name, image]);

	async function handleSave(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		setSuccess(null);
		setPending(true);

		const { error: updateError } = await authClient.updateUser({
			name: displayName,
			image: imageUrl || null,
		});

		setPending(false);

		if (updateError) {
			setError(updateError.message ?? "Failed to update profile");
			return;
		}
		setSuccess("Profile updated");
	}

	async function handleVerifyEmail() {
		setError(null);
		setSuccess(null);
		const { error: verifyError } = await authClient.sendVerificationEmail({
			email,
			callbackURL: "/account",
		});
		if (verifyError) {
			setError(verifyError.message ?? "Failed to send verification email");
			return;
		}
		setSuccess("Verification email sent");
	}

	return (
		<div className="flex flex-col gap-4">
			<Card>
				<CardHeader>
					<CardTitle>Profile</CardTitle>
					<CardDescription>Update your personal details</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSave} className="flex flex-col gap-4">
						<div className="flex flex-col gap-2">
							<Label htmlFor="account-name">Name</Label>
							<Input
								id="account-name"
								value={displayName}
								onChange={(event) => setDisplayName(event.target.value)}
								required
							/>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="account-image">Avatar URL</Label>
							<Input
								id="account-image"
								type="url"
								placeholder="https://example.com/avatar.png"
								value={imageUrl}
								onChange={(event) => setImageUrl(event.target.value)}
							/>
						</div>
						{error ? <p className="text-sm text-destructive">{error}</p> : null}
						{success ? (
							<p className="text-sm text-muted-foreground">{success}</p>
						) : null}
						<Button type="submit" disabled={pending} className="w-fit">
							{pending ? "Saving..." : "Save changes"}
						</Button>
					</form>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Email</CardTitle>
					<CardDescription>
						The email address attached to your account
					</CardDescription>
				</CardHeader>
				<CardContent className="flex items-center justify-between gap-4">
					<div className="flex min-w-0 items-center gap-2">
						<span className="truncate text-sm">{email}</span>
						{emailVerified ? (
							<Badge variant="outline">
								<CheckCircle2 className="text-emerald-600" />
								Verified
							</Badge>
						) : (
							<Badge variant="secondary">
								<XCircle />
								Unverified
							</Badge>
						)}
					</div>
					{!emailVerified ? (
						<Button variant="outline" onClick={handleVerifyEmail}>
							Verify email
						</Button>
					) : null}
				</CardContent>
			</Card>
		</div>
	);
}

function SecurityTab({
	twoFactorEnabled,
	refetchSession,
}: {
	twoFactorEnabled: boolean;
	refetchSession: () => Promise<unknown>;
}) {
	return (
		<div className="flex flex-col gap-4">
			<ChangePasswordCard />
			<TwoFactorCard
				enabled={twoFactorEnabled}
				refetchSession={refetchSession}
			/>
		</div>
	);
}

function ChangePasswordCard() {
	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [revokeOthers, setRevokeOthers] = useState(false);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		setSuccess(null);

		if (newPassword !== confirmPassword) {
			setError("New passwords do not match");
			return;
		}

		setPending(true);
		const { error: changeError } = await authClient.changePassword({
			currentPassword,
			newPassword,
			revokeOtherSessions: revokeOthers,
		});
		setPending(false);

		if (changeError) {
			setError(changeError.message ?? "Failed to change password");
			return;
		}
		setCurrentPassword("");
		setNewPassword("");
		setConfirmPassword("");
		setSuccess("Password changed");
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<KeyRound />
					Change password
				</CardTitle>
				<CardDescription>
					Use a strong password that you don&apos;t use anywhere else
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form onSubmit={handleSubmit} className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<Label htmlFor="current-password">Current password</Label>
						<Input
							id="current-password"
							type="password"
							value={currentPassword}
							onChange={(event) => setCurrentPassword(event.target.value)}
							required
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="new-password">New password</Label>
						<Input
							id="new-password"
							type="password"
							value={newPassword}
							onChange={(event) => setNewPassword(event.target.value)}
							required
							minLength={8}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="confirm-password">Confirm new password</Label>
						<Input
							id="confirm-password"
							type="password"
							value={confirmPassword}
							onChange={(event) => setConfirmPassword(event.target.value)}
							required
						/>
					</div>
					<div className="flex items-center gap-2">
						<Switch
							id="revoke-sessions"
							checked={revokeOthers}
							onCheckedChange={setRevokeOthers}
						/>
						<Label htmlFor="revoke-sessions">
							Sign out of all other sessions
						</Label>
					</div>
					{error ? <p className="text-sm text-destructive">{error}</p> : null}
					{success ? (
						<p className="text-sm text-muted-foreground">{success}</p>
					) : null}
					<Button type="submit" disabled={pending} className="w-fit">
						{pending ? "Updating..." : "Update password"}
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}

type TwoFactorSetup = {
	totpURI: string;
	backupCodes: string[];
};

function TwoFactorCard({
	enabled,
	refetchSession,
}: {
	enabled: boolean;
	refetchSession: () => Promise<unknown>;
}) {
	const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
	const [regenOpen, setRegenOpen] = useState(false);
	const [disableOpen, setDisableOpen] = useState(false);
	const [password, setPassword] = useState("");
	const [code, setCode] = useState("");
	const [newCodes, setNewCodes] = useState<string[] | null>(null);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	function reset() {
		setSetup(null);
		setNewCodes(null);
		setPassword("");
		setCode("");
		setError(null);
	}

	async function handleEnable(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		setPending(true);

		const { data, error: enableError } = await authClient.twoFactor.enable({
			password,
		});

		if (enableError || !data) {
			setError(enableError?.message ?? "Failed to enable 2FA");
			setPending(false);
			return;
		}

		let totpURI = (data as { totpURI?: string }).totpURI ?? "";
		if (!totpURI) {
			const { data: uriData } = await authClient.twoFactor.getTotpUri({
				password,
			});
			totpURI = (uriData as { uri?: string } | null)?.uri ?? "";
		}

		setSetup({
			totpURI,
			backupCodes: ((data as { backupCodes?: string[] }).backupCodes ?? []).map(
				String,
			),
		});
		setPassword("");
		setPending(false);
	}

	async function handleVerify(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		setPending(true);

		const { error: verifyError } = await authClient.twoFactor.verifyTotp({
			code,
		});

		setPending(false);

		if (verifyError) {
			setError(verifyError.message ?? "Invalid code");
			return;
		}
		reset();
		await refetchSession();
	}

	async function handleGenerateBackupCodes(
		event: React.FormEvent<HTMLFormElement>,
	) {
		event.preventDefault();
		setError(null);
		setPending(true);
		const { data, error: genError } =
			await authClient.twoFactor.generateBackupCodes({ password });
		setPending(false);

		if (genError || !data) {
			setError(genError?.message ?? "Failed to generate backup codes");
			return;
		}
		setNewCodes(
			((data as { backupCodes?: string[] }).backupCodes ?? []).map(String),
		);
		setPassword("");
		setRegenOpen(false);
	}

	async function handleDisable(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		setPending(true);
		const { error: disableError } = await authClient.twoFactor.disable({
			password,
		});
		setPending(false);

		if (disableError) {
			setError(disableError.message ?? "Failed to disable 2FA");
			return;
		}
		reset();
		setDisableOpen(false);
		await refetchSession();
	}

	if (enabled) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<ShieldCheck />
						Two-factor authentication
						<Badge variant="outline">Enabled</Badge>
					</CardTitle>
					<CardDescription>
						Your account is protected with an authenticator app
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					{newCodes ? (
						<div className="flex flex-col gap-2">
							<p className="text-sm font-medium">
								New backup codes — store them somewhere safe:
							</p>
							<div className="grid grid-cols-2 gap-1 rounded-lg border p-3 font-mono text-sm sm:grid-cols-3">
								{newCodes.map((backupCode) => (
									<span key={backupCode}>{backupCode}</span>
								))}
							</div>
							<Button
								variant="outline"
								className="w-fit"
								onClick={() => setNewCodes(null)}
							>
								I&apos;ve saved my codes
							</Button>
						</div>
					) : (
						<div className="flex flex-col gap-3 sm:flex-row">
							<Dialog
								open={regenOpen}
								onOpenChange={(open) => {
									setRegenOpen(open);
									if (!open) {
										setPassword("");
										setError(null);
									}
								}}
							>
								<DialogTrigger asChild>
									<Button variant="outline">Regenerate backup codes</Button>
								</DialogTrigger>
								<DialogContent>
									<DialogHeader>
										<DialogTitle>Regenerate backup codes</DialogTitle>
										<DialogDescription>
											Confirm your password to generate a new set of backup
											codes. Old codes will stop working.
										</DialogDescription>
									</DialogHeader>
									<form
										onSubmit={handleGenerateBackupCodes}
										className="flex flex-col gap-4"
									>
										<div className="flex flex-col gap-2">
											<Label htmlFor="backup-regen-password">Password</Label>
											<Input
												id="backup-regen-password"
												type="password"
												value={password}
												onChange={(event) => setPassword(event.target.value)}
												required
											/>
										</div>
										{error ? (
											<p className="text-sm text-destructive">{error}</p>
										) : null}
										<DialogFooter>
											<Button type="submit" disabled={pending}>
												{pending ? "Generating..." : "Generate"}
											</Button>
										</DialogFooter>
									</form>
								</DialogContent>
							</Dialog>
							<Dialog
								open={disableOpen}
								onOpenChange={(open) => {
									setDisableOpen(open);
									if (!open) {
										setPassword("");
										setError(null);
									}
								}}
							>
								<DialogTrigger asChild>
									<Button variant="destructive">Disable 2FA</Button>
								</DialogTrigger>
								<DialogContent>
									<DialogHeader>
										<DialogTitle>Disable two-factor authentication</DialogTitle>
										<DialogDescription>
											Your account will only be protected by your password. You
											can enable 2FA again at any time.
										</DialogDescription>
									</DialogHeader>
									<form
										onSubmit={handleDisable}
										className="flex flex-col gap-4"
									>
										<div className="flex flex-col gap-2">
											<Label htmlFor="disable-2fa-password">Password</Label>
											<Input
												id="disable-2fa-password"
												type="password"
												value={password}
												onChange={(event) => setPassword(event.target.value)}
												required
											/>
										</div>
										{error ? (
											<p className="text-sm text-destructive">{error}</p>
										) : null}
										<DialogFooter>
											<Button
												type="submit"
												variant="destructive"
												disabled={pending}
											>
												{pending ? "Disabling..." : "Disable 2FA"}
											</Button>
										</DialogFooter>
									</form>
								</DialogContent>
							</Dialog>
						</div>
					)}
				</CardContent>
			</Card>
		);
	}

	if (setup) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<ShieldCheck />
						Set up two-factor authentication
					</CardTitle>
					<CardDescription>
						Scan the QR code with your authenticator app, save your backup
						codes, then verify a code to finish
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-6">
					{setup.totpURI ? (
						<div className="flex flex-col items-center gap-2">
							<QRCodeSVG value={setup.totpURI} size={180} />
						</div>
					) : null}
					{setup.backupCodes.length > 0 ? (
						<div className="flex flex-col gap-2">
							<p className="text-sm font-medium">
								Backup codes — store them somewhere safe:
							</p>
							<div className="grid grid-cols-2 gap-1 rounded-lg border p-3 font-mono text-sm sm:grid-cols-3">
								{setup.backupCodes.map((backupCode) => (
									<span key={backupCode}>{backupCode}</span>
								))}
							</div>
						</div>
					) : null}
					<form onSubmit={handleVerify} className="flex flex-col gap-4">
						<div className="flex flex-col gap-2">
							<Label htmlFor="totp-code">6-digit code</Label>
							<Input
								id="totp-code"
								inputMode="numeric"
								pattern="[0-9]*"
								maxLength={6}
								value={code}
								onChange={(event) => setCode(event.target.value)}
								required
							/>
						</div>
						{error ? <p className="text-sm text-destructive">{error}</p> : null}
						<Button type="submit" disabled={pending} className="w-fit">
							{pending ? "Verifying..." : "Verify and enable"}
						</Button>
					</form>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<ShieldCheck />
					Two-factor authentication
					<Badge variant="secondary">Disabled</Badge>
				</CardTitle>
				<CardDescription>
					Add an extra layer of security with an authenticator app
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form onSubmit={handleEnable} className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<Label htmlFor="enable-2fa-password">Password</Label>
						<Input
							id="enable-2fa-password"
							type="password"
							value={password}
							onChange={(event) => setPassword(event.target.value)}
							required
						/>
					</div>
					{error ? <p className="text-sm text-destructive">{error}</p> : null}
					<Button type="submit" disabled={pending} className="w-fit">
						{pending ? "Setting up..." : "Enable 2FA"}
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}

function SessionsTab({ currentToken }: { currentToken: string }) {
	const [sessions, setSessions] = useState<SessionRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const loadSessions = useCallback(async () => {
		setLoading(true);
		setError(null);
		const { data, error: listError } = await authClient.listSessions();
		if (listError) {
			setError(listError.message ?? "Failed to load sessions");
		} else {
			setSessions(data ?? []);
		}
		setLoading(false);
	}, []);

	useEffect(() => {
		loadSessions();
	}, [loadSessions]);

	async function handleRevoke(token: string) {
		await authClient.revokeSession({ token });
		await loadSessions();
	}

	async function handleRevokeOthers() {
		await authClient.revokeOtherSessions();
		await loadSessions();
	}

	async function handleRevokeAll() {
		await authClient.revokeSessions();
		await loadSessions();
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Active sessions</CardTitle>
				<CardDescription>
					Devices currently signed in to your account
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<div className="flex gap-2">
					<Button variant="outline" onClick={handleRevokeOthers}>
						Revoke other sessions
					</Button>
					<AlertDialog>
						<AlertDialogTrigger asChild>
							<Button variant="destructive">Revoke all sessions</Button>
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>Revoke all sessions?</AlertDialogTitle>
								<AlertDialogDescription>
									This signs you out of every device, including this one.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>Cancel</AlertDialogCancel>
								<AlertDialogAction asChild>
									<Button variant="destructive" onClick={handleRevokeAll}>
										Revoke all
									</Button>
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</div>
				{error ? <p className="text-sm text-destructive">{error}</p> : null}
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Device</TableHead>
							<TableHead>IP address</TableHead>
							<TableHead>Signed in</TableHead>
							<TableHead>Expires</TableHead>
							<TableHead className="w-12" />
						</TableRow>
					</TableHeader>
					<TableBody>
						{loading ? (
							<TableRow>
								<TableCell colSpan={5}>Loading...</TableCell>
							</TableRow>
						) : (
							sessions.map((sessionItem) => {
								const isCurrent = sessionItem.token === currentToken;
								return (
									<TableRow key={sessionItem.token}>
										<TableCell>
											<div className="flex items-center gap-2">
												<span className="max-w-48 truncate text-sm">
													{sessionItem.userAgent ?? "Unknown device"}
												</span>
												{isCurrent ? (
													<Badge variant="outline">Current</Badge>
												) : null}
											</div>
										</TableCell>
										<TableCell>{sessionItem.ipAddress ?? "—"}</TableCell>
										<TableCell>
											{new Date(sessionItem.createdAt).toLocaleDateString()}
										</TableCell>
										<TableCell>
											{new Date(sessionItem.expiresAt).toLocaleDateString()}
										</TableCell>
										<TableCell>
											{!isCurrent ? (
												<Button
													variant="ghost"
													size="icon"
													aria-label="Revoke session"
													onClick={() => handleRevoke(sessionItem.token)}
												>
													<X />
												</Button>
											) : null}
										</TableCell>
									</TableRow>
								);
							})
						)}
					</TableBody>
				</Table>
			</CardContent>
		</Card>
	);
}
