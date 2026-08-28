import {
	type Column,
	flexRender,
	type Table as TanStackTable,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, ChevronsUpDown } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Skeleton } from "#/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";

export function DataTableToolbar({ children }: { children: ReactNode }) {
	return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

export function DataTableSearchInput({
	value,
	onChange,
	placeholder,
}: {
	value: string;
	onChange: (value: string) => void;
	placeholder: string;
}) {
	return (
		<Input
			placeholder={placeholder}
			value={value}
			onChange={(event) => onChange(event.target.value)}
			className="h-8 w-48 lg:w-64"
		/>
	);
}

export function SortableHeader<TData>({
	column,
	title,
}: {
	column: Column<TData, unknown>;
	title: string;
}) {
	return (
		<Button
			variant="ghost"
			size="sm"
			className="-ml-3 h-8"
			onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
		>
			{title}
			<ChevronsUpDown />
		</Button>
	);
}

export function DataTablePagination<TData>({
	table,
	totalRows,
	hidePagination = false,
}: {
	table: TanStackTable<TData>;
	totalRows?: number;
	hidePagination?: boolean;
}) {
	if (hidePagination) {
		return null;
	}
	const { pageIndex } = table.getState().pagination;
	const pageCount = table.getPageCount();
	const rows = totalRows ?? table.getFilteredRowModel().rows.length;
	return (
		<div className="flex items-center justify-between">
			<p className="text-sm text-muted-foreground">
				{rows} row{rows === 1 ? "" : "s"}
			</p>
			<div className="flex items-center gap-2">
				<Button
					variant="outline"
					size="sm"
					onClick={() => table.previousPage()}
					disabled={!table.getCanPreviousPage()}
				>
					<ChevronLeft />
					Previous
				</Button>
				<span className="text-sm text-muted-foreground">
					Page {pageIndex + 1} of {Math.max(pageCount, 1)}
				</span>
				<Button
					variant="outline"
					size="sm"
					onClick={() => table.nextPage()}
					disabled={!table.getCanNextPage()}
				>
					Next
					<ChevronRight />
				</Button>
			</div>
		</div>
	);
}

type DataTableProps<TData> = {
	table: TanStackTable<TData>;
	loading?: boolean;
	columnCount: number;
	toolbar?: ReactNode;
	totalRows?: number;
	hidePagination?: boolean;
};

export function DataTable<TData>({
	table,
	loading = false,
	columnCount,
	toolbar,
	totalRows,
	hidePagination = false,
}: DataTableProps<TData>) {
	return (
		<div className="flex flex-col gap-4">
			{toolbar ? <DataTableToolbar>{toolbar}</DataTableToolbar> : null}
			<div className="rounded-md border">
				<Table>
					<TableHeader>
						{table.getHeaderGroups().map((headerGroup) => (
							<TableRow key={headerGroup.id}>
								{headerGroup.headers.map((header) => (
									<TableHead key={header.id}>
										{header.isPlaceholder
											? null
											: flexRender(
													header.column.columnDef.header,
													header.getContext(),
												)}
									</TableHead>
								))}
							</TableRow>
						))}
					</TableHeader>
					<TableBody>
						{loading ? (
							Array.from({ length: 5 }).map((_, rowIndex) => (
								<TableRow
									// biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders have no stable identity
									key={rowIndex}
								>
									{Array.from({ length: columnCount }).map(
										(__, columnIndex) => (
											<TableCell
												// biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders have no stable identity
												key={columnIndex}
											>
												<Skeleton className="h-5 w-full" />
											</TableCell>
										),
									)}
								</TableRow>
							))
						) : table.getRowModel().rows.length === 0 ? (
							<TableRow>
								<TableCell
									colSpan={columnCount}
									className="h-24 text-center text-muted-foreground"
								>
									No results.
								</TableCell>
							</TableRow>
						) : (
							table.getRowModel().rows.map((row) => (
								<TableRow key={row.id}>
									{row.getVisibleCells().map((cell) => (
										<TableCell key={cell.id}>
											{flexRender(
												cell.column.columnDef.cell,
												cell.getContext(),
											)}
										</TableCell>
									))}
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>
			<DataTablePagination
				table={table}
				totalRows={totalRows}
				hidePagination={hidePagination}
			/>
		</div>
	);
}
