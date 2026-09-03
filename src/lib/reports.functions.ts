import { createServerFn } from "@tanstack/react-start";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "#/db";
import {
	attendance,
	attendanceIssue,
	employee,
	leaveRequest,
	leaveType,
} from "#/db/schema";
import { countWorkingDays, deriveIssues, enumerateDays, weekdayOf } from "./leave";
import { getHolidayDates } from "./holidays";
import { formatMinutes, formatZonedDate, getZonedParts } from "./schedule";
import { getOrgMemberContext } from "./session";

function pad(value: number): string {
	return String(value).padStart(2, "0");
}

function lastDayOfMonth(year: number, month: number): string {
	return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

type ReportRow = {
	employeeId: string;
	name: string;
	employeeNo: string;
	workingDays: number;
	present: number;
	late: number;
	earlyOut: number;
	missingOut: number;
	absent: number;
	issueCount: number;
	leaveDays: Record<string, number>;
	balanceRemaining: Record<string, number | null>;
};

export const getMonthlyReport = createServerFn({ method: "GET" })
	.validator((input: { year: number; month: number }) => input)
	.handler(async ({ data }) => {
		const context = await getOrgMemberContext();
		if (!context) {
			throw new Error("Unauthorized");
		}
		if (
			!Number.isInteger(data.year) ||
			!Number.isInteger(data.month) ||
			data.month < 1 ||
			data.month > 12
		) {
			throw new Error("Invalid month");
		}
		const isAdmin = ["owner", "admin"].includes(context.role ?? "");
		const isSupervisor = context.role === "supervisor";
		const workDays = context.org.workDays.split(",").map(Number);
		const today = formatZonedDate(new Date(), context.org.timezone);
		const balanceYear = today.slice(0, 4);
		const monthStart = `${data.year}-${pad(data.month)}-01`;
		const monthEnd = lastDayOfMonth(data.year, data.month);

		let targets: {
			id: string;
			name: string;
			employeeNo: string;
			workDays: string | null;
		}[] = [];
		let scope: "all" | "subordinates" | "self" | "none" = "none";
		if (isAdmin) {
			targets = await getDb()
				.select({
					id: employee.id,
					name: employee.name,
					employeeNo: employee.employeeNo,
					workDays: employee.workDays,
				})
				.from(employee)
				.where(
					and(
						eq(employee.organizationId, context.orgId),
						eq(employee.isActive, true),
					),
				)
				.orderBy(employee.employeeNo);
			scope = "all";
		} else if (isSupervisor && context.employee) {
			targets = await getDb()
				.select({
					id: employee.id,
					name: employee.name,
					employeeNo: employee.employeeNo,
					workDays: employee.workDays,
				})
				.from(employee)
				.where(
					and(
						eq(employee.organizationId, context.orgId),
						eq(employee.supervisorId, context.employee.id),
						eq(employee.isActive, true),
					),
				)
				.orderBy(employee.employeeNo);
			scope = "subordinates";
		} else if (context.employee) {
			const [own] = await getDb()
				.select({
					id: employee.id,
					name: employee.name,
					employeeNo: employee.employeeNo,
					workDays: employee.workDays,
				})
				.from(employee)
				.where(eq(employee.id, context.employee.id))
				.limit(1);
			if (own) {
				targets = [own];
				scope = "self";
			}
		}

		const types = await getDb()
			.select()
			.from(leaveType)
			.where(eq(leaveType.organizationId, context.orgId))
			.orderBy(leaveType.name);
		const holidayDates = await getHolidayDates(context.orgId);

		const rows: ReportRow[] = [];
		const issuesByEmployee: Record<
			string,
			{
				date: string;
				type: string;
				justification: string | null;
				status: string;
				reviewNote: string | null;
			}[]
		> = {};
		const dailyByEmployee: Record<
			string,
			{
				date: string;
				weekday: string;
				status: string;
				clockIn: string | null;
				clockOut: string | null;
				hours: number | null;
				note: string | null;
			}[]
		> = {};
		const targetIds = targets.map((row) => row.id);
		// each employee's day counting follows their own work days when overridden
		const workDaysByEmployee = new Map(
			targets.map((row) => [
				row.id,
				(row.workDays ?? context.org.workDays)
					.split(",")
					.map(Number)
					.filter((value) => value >= 0 && value <= 6),
			]),
		);
		if (targetIds.length > 0) {
			const records = await getDb()
				.select({
					employeeId: attendance.employeeId,
					date: attendance.date,
					clockIn: attendance.clockIn,
					clockInStatus: attendance.clockInStatus,
					clockOutStatus: attendance.clockOutStatus,
					clockOut: attendance.clockOut,
					note: attendance.note,
					clockOutNote: attendance.clockOutNote,
				})
				.from(attendance)
				.where(
					and(
						inArray(attendance.employeeId, targetIds),
						eq(attendance.organizationId, context.orgId),
						gte(attendance.date, monthStart),
						lte(attendance.date, monthEnd),
					),
				);
			const approvedLeave = await getDb()
				.select({
					employeeId: leaveRequest.employeeId,
					leaveTypeId: leaveRequest.leaveTypeId,
					startDate: leaveRequest.startDate,
					endDate: leaveRequest.endDate,
				})
				.from(leaveRequest)
				.where(
					and(
						inArray(leaveRequest.employeeId, targetIds),
						eq(leaveRequest.organizationId, context.orgId),
						eq(leaveRequest.status, "approved"),
						lte(leaveRequest.startDate, monthEnd),
						gte(leaveRequest.endDate, monthStart),
					),
				);
			const usedRanges = await getDb()
				.select({
					employeeId: leaveRequest.employeeId,
					leaveTypeId: leaveRequest.leaveTypeId,
					startDate: leaveRequest.startDate,
					endDate: leaveRequest.endDate,
				})
				.from(leaveRequest)
				.where(
					and(
						inArray(leaveRequest.employeeId, targetIds),
						eq(leaveRequest.organizationId, context.orgId),
						inArray(leaveRequest.status, ["pending", "approved"]),
					),
				);

			const recordsByEmployee = new Map<string, typeof records>();
			for (const record of records) {
				const list = recordsByEmployee.get(record.employeeId) ?? [];
				list.push(record);
				recordsByEmployee.set(record.employeeId, list);
			}
			const leaveCoveredByEmployee = new Map<string, Set<string>>();
			const leaveDaysByEmployeeType = new Map<string, number>();
			for (const request of approvedLeave) {
				const start =
					request.startDate < monthStart ? monthStart : request.startDate;
				const end = request.endDate > monthEnd ? monthEnd : request.endDate;
				const covered =
					leaveCoveredByEmployee.get(request.employeeId) ?? new Set<string>();
				for (const day of enumerateDays(start, end)) {
					covered.add(day);
				}
				leaveCoveredByEmployee.set(request.employeeId, covered);
				const days = countWorkingDays(
					start,
					end,
					workDaysByEmployee.get(request.employeeId) ?? workDays,
					holidayDates,
				);
				const key = `${request.employeeId}:${request.leaveTypeId}`;
				leaveDaysByEmployeeType.set(
					key,
					(leaveDaysByEmployeeType.get(key) ?? 0) + days,
				);
			}
			const usedByEmployeeType = new Map<string, number>();
			const balanceYearStart = `${balanceYear}-01-01`;
			const balanceYearEnd = `${balanceYear}-12-31`;
			for (const row of usedRanges) {
				const start =
					row.startDate < balanceYearStart ? balanceYearStart : row.startDate;
				const end =
					row.endDate > balanceYearEnd ? balanceYearEnd : row.endDate;
				if (start > end) {
					continue;
				}
				const key = `${row.employeeId}:${row.leaveTypeId}`;
				usedByEmployeeType.set(
					key,
					(usedByEmployeeType.get(key) ?? 0) +
						countWorkingDays(
							start,
							end,
							workDaysByEmployee.get(row.employeeId) ?? workDays,
							holidayDates,
						),
				);
			}

			const monthIssues = await getDb()
				.select({
					employeeId: attendanceIssue.employeeId,
					date: attendanceIssue.date,
					type: attendanceIssue.type,
					justification: attendanceIssue.justification,
					status: attendanceIssue.status,
					reviewNote: attendanceIssue.reviewNote,
				})
				.from(attendanceIssue)
				.where(
					and(
						inArray(attendanceIssue.employeeId, targetIds),
						eq(attendanceIssue.organizationId, context.orgId),
						gte(attendanceIssue.date, monthStart),
						lte(attendanceIssue.date, monthEnd),
					),
				)
				.orderBy(attendanceIssue.date);
			for (const issue of monthIssues) {
				const list = issuesByEmployee[issue.employeeId] ?? [];
				list.push({
					date: issue.date,
					type: issue.type,
					justification: issue.justification,
					status: issue.status,
					reviewNote: issue.reviewNote,
				});
				issuesByEmployee[issue.employeeId] = list;
			}

			for (const target of targets) {
				const recs = recordsByEmployee.get(target.id) ?? [];
				const targetWorkDays = workDaysByEmployee.get(target.id) ?? workDays;
			const issues = deriveIssues({
				records: recs,
				leaveCoveredDates:
					leaveCoveredByEmployee.get(target.id) ?? new Set<string>(),
				workDays: targetWorkDays,
				holidayDates,
				rangeStart: monthStart,
				rangeEnd: monthEnd,
				today,
			});
				const leaveDays: Record<string, number> = {};
				const balanceRemaining: Record<string, number | null> = {};
				for (const type of types) {
					leaveDays[type.id] =
						leaveDaysByEmployeeType.get(`${target.id}:${type.id}`) ?? 0;
					const used = usedByEmployeeType.get(`${target.id}:${type.id}`) ?? 0;
					balanceRemaining[type.id] =
						type.quotaDays === null ? null : type.quotaDays - used;
				}
				rows.push({
					employeeId: target.id,
					name: target.name,
					employeeNo: target.employeeNo,
					workingDays: countWorkingDays(
						monthStart,
						monthEnd,
						targetWorkDays,
						holidayDates,
					),
					present: recs.length,
					late: recs.filter((record) => record.clockInStatus === "late").length,
					earlyOut: recs.filter((record) => record.clockOutStatus === "short")
						.length,
					missingOut: recs.filter(
						(record) => record.clockOut === null && record.date < today,
					).length,
					absent: issues.filter((issue) => issue.type === "absent").length,
					issueCount: (issuesByEmployee[target.id] ?? []).length,
					leaveDays,
					balanceRemaining,
				});

				const WEEKDAY_LABELS = [
					"Sun",
					"Mon",
					"Tue",
					"Wed",
					"Thu",
					"Fri",
					"Sat",
				];
				const timezone = context.org.timezone;
				const formatClock = (timestamp: Date | null): string | null =>
					timestamp === null
						? null
						: formatMinutes(
								getZonedParts(timestamp, timezone).minutesSinceMidnight,
							);
				const recordByDate = new Map(recs.map((record) => [record.date, record]));
				const leaveCovered =
					leaveCoveredByEmployee.get(target.id) ?? new Set<string>();
				const daily: {
					date: string;
					weekday: string;
					status: string;
					clockIn: string | null;
					clockOut: string | null;
					hours: number | null;
					note: string | null;
				}[] = [];
				for (const date of enumerateDays(monthStart, monthEnd)) {
					const base = {
						date,
						weekday: WEEKDAY_LABELS[weekdayOf(date)],
						clockIn: null as string | null,
						clockOut: null as string | null,
						hours: null as number | null,
						note: null as string | null,
					};
					const record = recordByDate.get(date);
					if (!targetWorkDays.includes(weekdayOf(date))) {
						daily.push({ ...base, status: "off" });
						continue;
					}
					if (holidayDates.has(date)) {
						daily.push({
							...base,
							...(record
								? {
										clockIn: formatClock(record.clockIn),
										clockOut: formatClock(record.clockOut),
										hours:
											record.clockOut !== null
												? Math.round(
														((record.clockOut.getTime() -
															record.clockIn.getTime()) /
															360_000) /
															10,
													)
												: null,
										status: "present",
									}
								: { status: "holiday" }),
						});
						continue;
					}
					if (leaveCovered.has(date)) {
						daily.push({ ...base, status: "leave" });
						continue;
					}
					if (record) {
						const notes = [record.note, record.clockOutNote].filter(Boolean);
						daily.push({
							...base,
							status: record.clockInStatus === "late" ? "late" : "present",
							clockIn: formatClock(record.clockIn),
							clockOut: formatClock(record.clockOut),
							hours:
								record.clockOut !== null
									? Math.round(
											((record.clockOut.getTime() - record.clockIn.getTime()) /
												360_000) /
												10,
										)
									: null,
							note: notes.length > 0 ? notes.join(" / ") : null,
						});
						continue;
					}
					if (date >= today) {
						daily.push({ ...base, status: date === today ? "today" : "upcoming" });
						continue;
					}
					daily.push({ ...base, status: "absent" });
				}
				dailyByEmployee[target.id] = daily;
			}
		}

		return {
			scope,
			month: data.month,
			year: data.year,
			balanceYear,
			orgName: context.org.name,
			orgLogo: context.org.logo,
			leaveTypes: types.map((type) => ({
				id: type.id,
				name: type.name,
				quotaDays: type.quotaDays,
			})),
			rows,
			issuesByEmployee,
			dailyByEmployee,
		};
	});
