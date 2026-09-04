import { describe, expect, it } from "vitest";
import { dataRows, hasHeaderRow, parseCsv } from "./csv";

describe("parseCsv", () => {
	it("parses simple rows", () => {
		expect(parseCsv("a,b,c\nd,e,f")).toEqual([
			["a", "b", "c"],
			["d", "e", "f"],
		]);
	});

	it("handles quoted fields with commas", () => {
		expect(parseCsv('"Ali, Bin",2')).toEqual([["Ali, Bin", "2"]]);
	});

	it("handles escaped quotes inside quoted fields", () => {
		expect(parseCsv('"say ""hi""",x')).toEqual([['say "hi"', "x"]]);
	});

	it("handles CRLF line endings", () => {
		expect(parseCsv("a,b\r\nc,d\r\n")).toEqual([
			["a", "b"],
			["c", "d"],
		]);
	});

	it("keeps empty trailing fields", () => {
		expect(parseCsv("a,")).toEqual([["a", ""]]);
	});

	it("keeps a final line without newline", () => {
		expect(parseCsv("a\nb")).toEqual([
			["a"],
			["b"],
		]);
	});
});

describe("hasHeaderRow / dataRows", () => {
	it("detects a Name header case-insensitively", () => {
		const rows = parseCsv("name,EmployeeNo\nAli,EMP-1");
		expect(hasHeaderRow(rows)).toBe(true);
		expect(dataRows(rows)).toEqual([["Ali", "EMP-1"]]);
	});

	it("treats plain data as data when no header", () => {
		const rows = parseCsv("Ali,EMP-1");
		expect(hasHeaderRow(rows)).toBe(false);
		expect(dataRows(rows)).toEqual([["Ali", "EMP-1"]]);
	});
});
