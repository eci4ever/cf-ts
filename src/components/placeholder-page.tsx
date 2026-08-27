import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";

export function ComingSoon({ description }: { description: string }) {
	return (
		<Card className="mx-auto w-full max-w-xl">
			<CardHeader>
				<CardTitle>Coming soon</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent className="text-sm text-muted-foreground">
				This section will appear here once it&apos;s built.
			</CardContent>
		</Card>
	);
}
