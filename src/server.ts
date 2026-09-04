// Custom Cloudflare Worker entrypoint for the TanStack Start app.
//
// wrangler.jsonc sets `main` to this file. `fetch` is delegated unchanged to
// the TanStack Start default server entry (SSR, routes, server functions);
// `scheduled` runs the cron jobs (absent sweep + clock-in/out reminders) that
// the */15 cron trigger invokes. Cron logic itself lives in lib/cron.jobs.ts.
import serverEntry from "@tanstack/react-start/server-entry";
import { runCron } from "./lib/cron.jobs";

export default {
	// TanStack's fetch takes (request, requestOptions) while the Worker
	// runtime supplies (request, env, ctx) — forward only the request.
	fetch: (request, _env, _ctx) => serverEntry.fetch(request),

	async scheduled(controller: ScheduledController, _env: Cloudflare.Env, ctx: ExecutionContext) {
		console.log(`Cron triggered: ${controller.cron}`);
		ctx.waitUntil(
			runCron(new Date())
				.then((result) => {
					console.log(
						`[cron] sweep=${result.sweepOrgs} clockIn=${result.clockIn} clockOut=${result.clockOut}`,
					);
				})
				.catch((error) => {
					console.error(
						"[cron] failed:",
						error instanceof Error ? error.message : error,
					);
				}),
		);
	},
} satisfies ExportedHandler<Cloudflare.Env>;
