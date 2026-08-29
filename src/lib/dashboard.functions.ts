import { createServerFn } from "@tanstack/react-start";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "#/db";
import { attendance, employee, leaveRequest } from "#/db/schema";
import { formatZonedDate } from "./schedule";
import { getOrgMemberContext } from "./session";

export const getOrgDashboardStats = createServerFn({ method: "GET" }).handler(
	async () => {
		const context = await getOrgMemberContext();
		if (!context) {
			throw new Error("Unauthorized");
		}
		const isAdmin = ["owner", "admin"].includes(context.role ?? "");
		const isSupervisor = context.role === "supervisor";
		if (!isAdmin && !isSupervisor) {
			return null;
		}
		if (!isAdmin && !context.employee) {
			return {
				presentToday: 0,
				onLeaveToday: 0,
				lateToday: 0,
				totalEmployees: 0,
			};
		}

		const today = formatZonedDate(new Date(), context.org.timezone);
		const [year, month, day] = today.split("-").map(Number);
		const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
		const isWorkDay = context.org.workDays
			.split(",")
			.map(Number)
			.includes(weekday);

		const scopeWhere = isAdmin
			? and(
					eq(employee.organizationId, context.orgId),
					eq(employee.isActive, true),
				)
			: and(
					eq(employee.organizationId, context.orgId),
					eq(employee.supervisorId, context.employee?.id ?? ""),
					eq(employee.isActive, true),
				);
		const targets = await getDb()
			.select({ id: employee.id })
			.from(employee)
			.where(scopeWhere);
		const targetIds = targets.map((row) => row.id);
		const totalEmployees = targetIds.length;

		let presentToday = 0;
		let lateToday = 0;
		if (targetIds.length > 0) {
			const records = await getDb()
				.select({
					employeeId: attendance.employeeId,
					clockInStatus: attendance.clockInStatus,
				})
				.from(attendance)
				.where(
					and(
						eq(attendance.organizationId, context.orgId),
						eq(attendance.date, today),
						inArray(attendance.employeeId, targetIds),
					),
				);
			presentToday = records.length;
			lateToday = records.filter((row) => row.clockInStatus === "late").length;
		}

		let onLeaveToday = 0;
		if (targetIds.length > 0 && isWorkDay) {
			const leaves = await getDb()
				.select({ employeeId: leaveRequest.employeeId })
				.from(leaveRequest)
				.where(
					and(
						eq(leaveRequest.organizationId, context.orgId),
						eq(leaveRequest.status, "approved"),
						inArray(leaveRequest.employeeId, targetIds),
						lte(leaveRequest.startDate, today),
						gte(leaveRequest.endDate, today),
					),
				);
			onLeaveToday = new Set(leaves.map((row) => row.employeeId)).size;
		}

		return { presentToday, onLeaveToday, lateToday, totalEmployees };
	},
);
