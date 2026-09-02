import { Badge } from "#/components/ui/badge";

const ROLE_STYLES: Record<string, { label: string; className: string }> = {
	owner: {
		label: "Owner",
		className:
			"border-transparent bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400",
	},
	admin: {
		label: "Admin",
		className:
			"border-transparent bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-400",
	},
	supervisor: {
		label: "Supervisor",
		className:
			"border-transparent bg-teal-100 text-teal-800 dark:bg-teal-500/15 dark:text-teal-400",
	},
	platform: {
		label: "Platform Admin",
		className:
			"border-purple-200 bg-purple-50 text-purple-800 dark:border-purple-500/40 dark:bg-purple-500/10 dark:text-purple-400",
	},
};

/**
 * Colored badge for a user's role. Unknown or plain roles (e.g. "member")
 * render nothing — absence of a badge means an ordinary member.
 */
export function RoleBadge({ role }: { role: string }) {
	const style = ROLE_STYLES[role];
	if (!style) {
		return null;
	}
	return (
		<Badge variant="outline" className={style.className}>
			{style.label}
		</Badge>
	);
}
