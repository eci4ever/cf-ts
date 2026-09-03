import { runCron } from "../src/lib/cron.jobs";

export default {
	async scheduled(
		_controller: ScheduledController,
		_env: unknown,
		ctx: ExecutionContext,
	) {
		ctx.waitUntil(
			runCron(new Date())
				.then((result) => {
					console.log(
						`[cron] sweep=${result.sweepOrgs} clockIn=${result.clockIn} clockOut=${result.clockOut}`,
					);
				})
				.catch((error) => {
					console.error("[cron] failed:", error?.message, error?.cause ?? "");
				}),
		);
	},
};
