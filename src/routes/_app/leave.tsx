import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "#/components/placeholder-page";

export const Route = createFileRoute("/_app/leave")({
	staticData: { title: "Leave" },
	component: () => (
		<ComingSoon description="Leave requests, approvals, and balances will be managed from here." />
	),
});
