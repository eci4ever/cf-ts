import {
	type AnySQLiteColumn,
	integer,
	real,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const user = sqliteTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: integer("email_verified", { mode: "boolean" }).notNull(),
	image: text("image"),
	role: text("role"),
	banned: integer("banned", { mode: "boolean" }),
	banReason: text("ban_reason"),
	banExpires: integer("ban_expires", { mode: "timestamp" }),
	twoFactorEnabled: integer("two_factor_enabled", { mode: "boolean" })
		.notNull()
		.default(false),
	createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const twoFactor = sqliteTable("two_factor", {
	id: text("id").primaryKey(),
	secret: text("secret").notNull(),
	backupCodes: text("backup_codes").notNull(),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	verified: integer("verified", { mode: "boolean" }).default(true),
	failedVerificationCount: integer("failed_verification_count").default(0),
	lockedUntil: integer("locked_until", { mode: "timestamp" }),
});

export const session = sqliteTable("session", {
	id: text("id").primaryKey(),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	token: text("token").notNull().unique(),
	expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	impersonatedBy: text("impersonated_by"),
	activeOrganizationId: text("active_organization_id"),
	createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const account = sqliteTable(
	"account",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		issuer: text("issuer").notNull(),
		accountId: text("account_id").notNull(),
		providerId: text("provider_id").notNull(),
		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		accessTokenExpiresAt: integer("access_token_expires_at", {
			mode: "timestamp",
		}),
		refreshTokenExpiresAt: integer("refresh_token_expires_at", {
			mode: "timestamp",
		}),
		scope: text("scope"),
		idToken: text("id_token"),
		password: text("password"),
		createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
	},
	(table) => [
		uniqueIndex("account_issuer_account_id_uq").on(
			table.issuer,
			table.accountId,
		),
	],
);

export const verification = sqliteTable("verification", {
	id: text("id").primaryKey(),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
	createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const organization = sqliteTable("organization", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	slug: text("slug").notNull().unique(),
	logo: text("logo"),
	metadata: text("metadata"),
	plan: text("plan").notNull().default("free"),
	pendingPlan: text("pending_plan"),
	balanceSen: integer("balance_sen").notNull().default(0),
	paidUntil: integer("paid_until", { mode: "timestamp" }),
	workDays: text("work_days").notNull().default("1,2,3,4,5"),
	workStartMinutes: integer("work_start_minutes").notNull().default(540),
	workEndMinutes: integer("work_end_minutes").notNull().default(1080),
	graceMinutes: integer("grace_minutes").notNull().default(15),
	timezone: text("timezone").notNull().default("Asia/Kuala_Lumpur"),
	geofenceEnabled: integer("geofence_enabled", { mode: "boolean" })
		.notNull()
		.default(false),
	createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const workSite = sqliteTable("work_site", {
	id: text("id").primaryKey(),
	organizationId: text("organization_id")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
	name: text("name").notNull(),
	lat: real("lat"),
	lng: real("lng"),
	radiusM: integer("radius_m").notNull().default(100),
	createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const employee = sqliteTable(
	"employee",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
		supervisorId: text("supervisor_id").references(
			(): AnySQLiteColumn => employee.id,
			{ onDelete: "set null" },
		),
		siteId: text("site_id").references(() => workSite.id, {
			onDelete: "set null",
		}),
		name: text("name").notNull(),
		employeeNo: text("employee_no").notNull(),
		position: text("position"),
		shift: text("shift").notNull().default("normal"),
		joinedAt: integer("joined_at", { mode: "timestamp" }),
		isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
		createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
	},
	(table) => [
		uniqueIndex("employee_org_no_uq").on(
			table.organizationId,
			table.employeeNo,
		),
		uniqueIndex("employee_org_user_uq").on(table.organizationId, table.userId),
	],
);

export const leaveType = sqliteTable(
	"leave_type",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		quotaDays: integer("quota_days"),
		createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
	},
	(table) => [
		uniqueIndex("leave_type_org_name_uq").on(table.organizationId, table.name),
	],
);

export const leaveRequest = sqliteTable("leave_request", {
	id: text("id").primaryKey(),
	organizationId: text("organization_id")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
	employeeId: text("employee_id")
		.notNull()
		.references(() => employee.id, { onDelete: "cascade" }),
	leaveTypeId: text("leave_type_id")
		.notNull()
		.references(() => leaveType.id, { onDelete: "cascade" }),
	startDate: text("start_date").notNull(),
	endDate: text("end_date").notNull(),
	days: integer("days").notNull(),
	reason: text("reason").notNull(),
	status: text("status").notNull().default("pending"),
	decidedBy: text("decided_by").references(() => user.id, {
		onDelete: "set null",
	}),
	decidedAt: integer("decided_at", { mode: "timestamp" }),
	decisionReason: text("decision_reason"),
	createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const attendanceIssue = sqliteTable(
	"attendance_issue",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		employeeId: text("employee_id")
			.notNull()
			.references(() => employee.id, { onDelete: "cascade" }),
		date: text("date").notNull(),
		type: text("type").notNull(),
		justification: text("justification"),
		status: text("status").notNull().default("open"),
		verifiedBy: text("verified_by").references(() => user.id, {
			onDelete: "set null",
		}),
		verifiedAt: integer("verified_at", { mode: "timestamp" }),
		createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
	},
	(table) => [
		uniqueIndex("attendance_issue_uq").on(
			table.employeeId,
			table.date,
			table.type,
		),
	],
);

export const attendance = sqliteTable(
	"attendance",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		employeeId: text("employee_id")
			.notNull()
			.references(() => employee.id, { onDelete: "cascade" }),
		date: text("date").notNull(),
		clockIn: integer("clock_in", { mode: "timestamp" }).notNull(),
		clockInStatus: text("clock_in_status").notNull(),
		clockOut: integer("clock_out", { mode: "timestamp" }),
		clockOutStatus: text("clock_out_status"),
		siteId: text("site_id").references(() => workSite.id, {
			onDelete: "set null",
		}),
		lat: real("lat"),
		lng: real("lng"),
		distanceM: real("distance_m"),
		locationStatus: text("location_status"),
		clockOutLat: real("clock_out_lat"),
		clockOutLng: real("clock_out_lng"),
		clockOutDistanceM: real("clock_out_distance_m"),
		clockOutLocationStatus: text("clock_out_location_status"),
		note: text("note"),
		createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
	},
	(table) => [
		uniqueIndex("attendance_org_employee_date_uq").on(
			table.organizationId,
			table.employeeId,
			table.date,
		),
	],
);

export const creditLedger = sqliteTable("credit_ledger", {
	id: text("id").primaryKey(),
	organizationId: text("organization_id")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
	type: text("type").notNull(),
	amountSen: integer("amount_sen").notNull(),
	balanceAfterSen: integer("balance_after_sen").notNull(),
	note: text("note"),
	createdBy: text("created_by").references(() => user.id, {
		onDelete: "set null",
	}),
	createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const member = sqliteTable("member", {
	id: text("id").primaryKey(),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	organizationId: text("organization_id")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
	role: text("role").notNull(),
	createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const invitation = sqliteTable("invitation", {
	id: text("id").primaryKey(),
	email: text("email").notNull(),
	inviterId: text("inviter_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	organizationId: text("organization_id")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
	role: text("role"),
	status: text("status").notNull(),
	createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
	expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
});
