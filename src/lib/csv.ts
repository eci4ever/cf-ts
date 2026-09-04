// Minimal RFC-4180-ish CSV parsing shared by the client (preview) and the
// import server fn (validation + insert). Supports quoted fields, escaped
// quotes ("" → ") and CRLF line endings.

export function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let inQuotes = false;
	for (let i = 0; i < text.length; i += 1) {
		const ch = text[i];
		if (inQuotes) {
			if (ch === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i += 1;
				} else {
					inQuotes = false;
				}
			} else {
				field += ch;
			}
		} else if (ch === '"') {
			inQuotes = true;
		} else if (ch === ",") {
			row.push(field);
			field = "";
		} else if (ch === "\n") {
			row.push(field);
			rows.push(row);
			row = [];
			field = "";
		} else if (ch !== "\r") {
			field += ch;
		}
	}
	if (field.length > 0 || row.length > 0) {
		row.push(field);
		rows.push(row);
	}
	return rows;
}

// The expected header's first column is "Name" — skip the first row when present
export function hasHeaderRow(rows: string[][]): boolean {
	return (
		rows.length > 0 && (rows[0][0] ?? "").trim().toLowerCase() === "name"
	);
}

export function dataRows(rows: string[][]): string[][] {
	return hasHeaderRow(rows) ? rows.slice(1) : rows;
}
