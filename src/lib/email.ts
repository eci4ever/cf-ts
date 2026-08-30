import { env } from "cloudflare:workers";
import { Resend } from "resend";

export type SendEmailInput = {
	to: string;
	subject: string;
	html: string;
	idempotencyKey?: string;
};

export type SendEmailResult = {
	delivered: boolean;
	reason?: string;
};

export async function sendEmail({
	to,
	subject,
	html,
	idempotencyKey,
}: SendEmailInput): Promise<SendEmailResult> {
	const apiKey = env.RESEND_API_KEY;
	if (!apiKey) {
		console.warn("[email] RESEND_API_KEY not set; skipping", { to, subject });
		return { delivered: false, reason: "missing_api_key" };
	}

	const resend = new Resend(apiKey);
	const { data, error } = await resend.emails.send({
		from: env.EMAIL_FROM || "admin@resend.dev",
		to: [to],
		subject,
		html,
		...(idempotencyKey ? { idempotencyKey } : {}),
	});

	if (error) {
		console.error("[email] Resend send failed", error);
		return { delivered: false, reason: "send_failed" };
	}

	console.log("[email] sent", data?.id);
	return { delivered: true };
}
