import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "#/components/placeholder-page";

export const Route = createFileRoute("/_app/employees")({
	staticData: { title: "Employees" },
	component: () => (
		<ComingSoon description="Add and manage employees, assign them to teams and locations." />
	),
});
