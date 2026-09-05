import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Landmark, Mail } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
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
	getPlatformPaymentSettings,
	savePlatformPaymentSettings,
} from "#/lib/billing.functions";

export const Route = createFileRoute("/_app/admin/settings")({
	staticData: { title: "Payment settings" },
	component: PaymentSettingsPage,
});

const QR_MAX_BYTES = 300_000;

function PaymentSettingsPage() {
	const queryClient = useQueryClient();
	const settingsQuery = useQuery({
		queryKey: ["admin", "payment-settings"],
		queryFn: getPlatformPaymentSettings,
	});
	const [bankName, setBankName] = useState("");
	const [bankAccount, setBankAccount] = useState("");
	const [accountHolder, setAccountHolder] = useState("");
	const [contactEmail, setContactEmail] = useState("");
	const [qrBase64, setQrBase64] = useState<string | null>(null);
	const [qrCleared, setQrCleared] = useState(false);
	const fileRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		const saved = settingsQuery.data;
		if (!saved) return;
		setBankName(saved.bankName ?? "");
		setBankAccount(saved.bankAccount ?? "");
		setAccountHolder(saved.accountHolder ?? "");
		setContactEmail(saved.contactEmail ?? "");
		setQrBase64(saved.qrBase64 ?? null);
	}, [settingsQuery.data]);

	const saveMutation = useMutation({
		mutationFn: async () => {
			const result = await savePlatformPaymentSettings({
				data: {
					bankName,
					bankAccount,
					accountHolder,
					contactEmail,
					qrBase64: qrCleared ? null : qrBase64,
				},
			});
			if (!result.ok) {
				throw new Error(result.reason);
			}
			return result;
		},
		onSuccess: () => {
			toast.success("Payment settings saved");
			setQrCleared(false);
			queryClient.invalidateQueries({ queryKey: ["admin", "payment-settings"] });
			queryClient.invalidateQueries({
				queryKey: ["billing", "payment-instructions"],
			});
		},
		onError: (error) => toast.error(error.message),
	});

	function handleQrChosen(file: File | undefined) {
		if (!file) return;
		if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
			toast.error("QR must be a PNG, JPG or WebP image");
			return;
		}
		if (file.size > QR_MAX_BYTES) {
			toast.error("QR image too large (max 300KB)");
			return;
		}
		const reader = new FileReader();
		reader.onload = () => {
			setQrBase64(String(reader.result));
			setQrCleared(false);
		};
		reader.readAsDataURL(file);
	}

	if (settingsQuery.isPending) {
		return <p className="text-sm text-muted-foreground">Loading settings…</p>;
	}

	const previewQr = qrCleared ? null : qrBase64;

	return (
		<Card className="max-w-xl">
			<CardHeader>
				<CardTitle>Manual payment settings</CardTitle>
				<CardDescription>
					Shown to organization admins in the Billing top-up dialog. Buyers
					transfer to this account and email their payment proof to the contact
					address; you approve top-ups in Organization management.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<div className="flex flex-col gap-2">
					<Label htmlFor="pay-bank">Bank name</Label>
					<Input
						id="pay-bank"
						value={bankName}
						onChange={(event) => setBankName(event.target.value)}
						placeholder="Maybank"
					/>
				</div>
				<div className="flex flex-col gap-2">
					<Label htmlFor="pay-account">Account number</Label>
					<Input
						id="pay-account"
						value={bankAccount}
						onChange={(event) => setBankAccount(event.target.value)}
						placeholder="5123 4567 8901"
						className="font-mono"
					/>
				</div>
				<div className="flex flex-col gap-2">
					<Label htmlFor="pay-holder">Account holder name</Label>
					<Input
						id="pay-holder"
						value={accountHolder}
						onChange={(event) => setAccountHolder(event.target.value)}
						placeholder="TapMe Enterprise"
					/>
				</div>
				<div className="flex flex-col gap-2">
					<Label htmlFor="pay-email">Contact email for payment proof</Label>
					<Input
						id="pay-email"
						type="email"
						value={contactEmail}
						onChange={(event) => setContactEmail(event.target.value)}
						placeholder="payments@yourdomain.com"
					/>
					<p className="flex items-center gap-1.5 text-xs text-muted-foreground">
						<Mail className="size-3.5" />
						Buyers email their bank-in receipt here with the payment reference.
					</p>
				</div>
				<div className="flex flex-col gap-2">
					<Label>DuitNow QR (optional)</Label>
					{previewQr ? (
						<div className="flex items-center gap-3">
							<img
								src={previewQr}
								alt="DuitNow QR preview"
								className="size-32 rounded border bg-white object-contain p-1"
							/>
							<div className="flex flex-col gap-2">
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => fileRef.current?.click()}
								>
									Replace
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onClick={() => {
										setQrBase64(null);
										setQrCleared(true);
									}}
								>
									Remove
								</Button>
							</div>
						</div>
					) : (
						<div>
							<input
								ref={fileRef}
								type="file"
								accept="image/png,image/jpeg,image/webp"
								className="sr-only"
								onChange={(event) => {
									handleQrChosen(event.target.files?.[0]);
									event.target.value = "";
								}}
							/>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => fileRef.current?.click()}
							>
								<Landmark />
								Upload QR image (PNG/JPG, max 300KB)
							</Button>
						</div>
					)}
				</div>
				<Button
					className="self-start"
					disabled={saveMutation.isPending}
					onClick={() => saveMutation.mutate()}
				>
					{saveMutation.isPending ? "Saving…" : "Save payment settings"}
				</Button>
			</CardContent>
		</Card>
	);
}
