import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "#/db";
import {
	attendance,
	attendanceIssue,
	leaveRequest,
} from "#/db/schema";
import { deriveIssues } from "./leave";
import { getHolidayDates } from "./holidays";
import { formatZonedDate } from "./schedule";

export async function syncIssues(options: {
	orgId: string;
	employeeIds: string[];
	workDays: number[];
	timezone: string;
	monthStart?: string;
}): Promise<void> {
	if (options.employeeIds.length === 0) {
		return;
	}
	const now = new Date();
	const today = formatZonedDate(now, options.timezone);
	const monthStart = options.monthStart ?? `${today.slice(0, 7)}-01`;
	const records = await getDb()
		.select({
			employeeId: attendance.employeeId,
			date: attendance.date,
			clockInStatus: attendance.clockInStatus,
			clockOutStatus: attendance.clockOutStatus,
			clockOut: attendance.clockOut,
		})
		.from(attendance)
		.where(
			and(
				inArray(attendance.employeeId, options.employeeIds),
				eq(attendance.organizationId, options.orgId),
			),
		);
	const relevant = records.filter(
		(record) => record.date >= monthStart && record.date < today,
	);
	const approvedLeave = await getDb()
		.select({
			employeeId: leaveRequest.employeeId,
			startDate: leaveRequest.startDate,
			endDate: leaveRequest.endDate,
		})
		.from(leaveRequest)
		.where(
			and(
				inArray(leaveRequest.employeeId, options.employeeIds),
				eq(leaveRequest.status, "approved"),
			),
		);
	const leaveCovered = new Set<string>();
	for (const request of approvedLeave) {
		let cursor = request.startDate;
		while (cursor <= request.endDate) {
			if (cursor >= monthStart) {
				leaveCovered.add(`${request.employeeId}:${cursor}`);
			}
			const [year, month, day] = cursor.split("-").map(Number);
			cursor = new Date(Date.UTC(year, month - 1, day + 1))
				.toISOString()
				.slice(0, 10);
		}
	}
	const recordsByEmployee = new Map<string, typeof relevant>();
	for (const record of relevant) {
		const list = recordsByEmployee.get(record.employeeId) ?? [];
		list.push(record);
		recordsByEmployee.set(record.employeeId, list);
	}
	const holidayDates = await getHolidayDates(options.orgId, monthStart, today);
	const derived: {
		organizationId: string;
		employeeId: string;
		date: string;
		type: string;
	}[] = [];
	for (const employeeId of options.employeeIds) {
		const derivedForEmployee = deriveIssues({
			records: recordsByEmployee.get(employeeId) ?? [],
			leaveCoveredDates: new Set(
				[...leaveCovered]
					.filter((key) => key.startsWith(`${employeeId}:`))
					.map((key) => key.split(":")[1]),
			),
			workDays: options.workDays,
			holidayDates,
			rangeStart: monthStart,
			rangeEnd: today,
			today,
		});
		for (const issue of derivedForEmployee) {
			derived.push({
				organizationId: options.orgId,
				employeeId,
				date: issue.date,
				type: issue.type,
			});
		}
	}
	const existing = await getDb()
		.select({
			id: attendanceIssue.id,
			employeeId: attendanceIssue.employeeId,
			date: attendanceIssue.date,
			type: attendanceIssue.type,
			status: attendanceIssue.status,
		})
		.from(attendanceIssue)
		.where(
			and(
				eq(attendanceIssue.organizationId, options.orgId),
				inArray(attendanceIssue.employeeId, options.employeeIds),
			),
		);
	const derivedKeys = new Set(
		derived.map((issue) => `${issue.employeeId}:${issue.date}:${issue.type}`),
	);
	const existingKeys = new Set(
		existing.map((issue) => `${issue.employeeId}:${issue.date}:${issue.type}`),
	);
	const toInsert = derived.filter(
		(issue) =>
			!existingKeys.has(`${issue.employeeId}:${issue.date}:${issue.type}`),
	);
	if (toInsert.length > 0) {
		const CHUNK_SIZE = 10;
		for (let index = 0; index < toInsert.length; index += CHUNK_SIZE) {
			await getDb()
				.insert(attendanceIssue)
				.values(
					toInsert.slice(index, index + CHUNK_SIZE).map((issue) => ({
						id: crypto.randomUUID(),
						organizationId: issue.organizationId,
						employeeId: issue.employeeId,
						date: issue.date,
						type: issue.type,
						justification: null,
						status: "open",
						createdAt: now,
						updatedAt: now,
					})),
				)
				.onConflictDoNothing();
		}
	}
	const stale = existing.filter(
		(issue) =>
			issue.status === "open" &&
			issue.type !== "outside" &&
			!derivedKeys.has(`${issue.employeeId}:${issue.date}:${issue.type}`),
	);
	for (const issue of stale) {
		await getDb()
			.delete(attendanceIssue)
			.where(eq(attendanceIssue.id, issue.id));
	}
}
