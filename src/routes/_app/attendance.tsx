import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "#/components/placeholder-page";

export const Route = createFileRoute("/_app/attendance")({
	staticData: { title: "Attendance" },
	component: () => (
		<ComingSoon description="Daily check-ins, check-outs, and attendance history for your team will live here." />
	),
});
