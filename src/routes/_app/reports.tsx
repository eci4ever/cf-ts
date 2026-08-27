import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "#/components/placeholder-page";

export const Route = createFileRoute("/_app/reports")({
	staticData: { title: "Reports" },
	component: () => (
		<ComingSoon description="Payroll-ready attendance reports and exports will be available here." />
	),
});
