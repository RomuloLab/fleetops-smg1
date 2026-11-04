import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const managerUsers = sqliteTable("manager_users", {
  id: text("id").primaryKey(), name: text("name").notNull(), email: text("email").notNull(),
  identityId: text("identity_id"), permissions: text("permissions").notNull().default("[]"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  isMaster: integer("is_master", { mode: "boolean" }).notNull().default(false),
  emailVerifiedAt: text("email_verified_at"),
  inviteStatus: text("invite_status").notNull().default("not_sent"),
  inviteSentAt: text("invite_sent_at"), inviteError: text("invite_error").notNull().default(""),
  revision: integer("revision").notNull().default(1), changeId: text("change_id"),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, table => [uniqueIndex("manager_users_email").on(table.email), uniqueIndex("manager_users_identity_id").on(table.identityId)]);

// Better Auth owns verification and session issuance. All application
// permissions continue to come from manager_users on every request.
export const emailAuthUsers = sqliteTable("email_auth_users", {
  id: text("id").primaryKey(), name: text("name").notNull(), email: text("email").notNull(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false), image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(), updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, table => [uniqueIndex("email_auth_users_email").on(table.email)]);
export const emailAuthSessions = sqliteTable("email_auth_sessions", {
  id: text("id").primaryKey(), token: text("token").notNull(), userId: text("user_id").notNull().references(() => emailAuthUsers.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(), updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  ipAddress: text("ip_address"), userAgent: text("user_agent"),
}, table => [uniqueIndex("email_auth_sessions_token").on(table.token), index("email_auth_sessions_user").on(table.userId)]);
export const emailAuthAccounts = sqliteTable("email_auth_accounts", {
  id: text("id").primaryKey(), accountId: text("account_id").notNull(), providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => emailAuthUsers.id, { onDelete: "cascade" }),
  accessToken: text("access_token"), refreshToken: text("refresh_token"), idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }), refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
  scope: text("scope"), password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(), updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, table => [index("email_auth_accounts_user").on(table.userId)]);
export const emailAuthVerifications = sqliteTable("email_auth_verifications", {
  id: text("id").primaryKey(), identifier: text("identifier").notNull(), value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(), updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, table => [index("email_auth_verifications_identifier").on(table.identifier)]);
export const emailRateLimits = sqliteTable("email_rate_limits", {
  key: text("key").primaryKey(), count: integer("count").notNull(), resetsAt: integer("resets_at").notNull(),
});
export const mailSettings = sqliteTable("mail_settings", {
  id: text("id").primaryKey(), encryptedKey: text("encrypted_key").notNull(), fromEmail: text("from_email").notNull(),
  revision: integer("revision").notNull().default(1), changeId: text("change_id").notNull(), updatedAt: text("updated_at").notNull(),
});
export const stelaVoiceSettings = sqliteTable("stela_voice_settings", {
  id: text("id").primaryKey(), encryptedKey: text("encrypted_key").notNull(),
  voiceId: text("voice_id").notNull().default(""), voiceName: text("voice_name").notNull().default(""),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  monthlyLimit: integer("monthly_limit").notNull().default(5000),
  revision: integer("revision").notNull().default(1), changeId: text("change_id").notNull(), updatedAt: text("updated_at").notNull(),
});
export const stelaVoiceUsage = sqliteTable("stela_voice_usage", {
  period: text("period").primaryKey(), characters: integer("characters").notNull().default(0),
});
export const mailDeliveries = sqliteTable("mail_deliveries", {
  id: text("id").primaryKey(), email: text("email").notNull(), managerId: text("manager_id"), purpose: text("purpose").notNull(),
  status: text("status").notNull().default("pending"), providerId: text("provider_id"), error: text("error").notNull().default(""),
  createdAt: text("created_at").notNull(), completedAt: text("completed_at"),
}, table => [index("mail_deliveries_manager").on(table.managerId)]);
export const registeredCarriers = sqliteTable("registered_carriers", {
  id: text("id").primaryKey(), slug: text("slug").notNull(), name: text("name").notNull(), nameKey: text("name_key").notNull(), initials: text("initials").notNull(),
  logoKey: text("logo_key"), logoMime: text("logo_mime"), logoHash: text("logo_hash").notNull().default(""),
  logoWidth: integer("logo_width").notNull().default(0), logoHeight: integer("logo_height").notNull().default(0),
  logoViewBox: text("logo_view_box").notNull().default(""), logoBackground: text("logo_background").notNull().default("#ffffff"),
  createdAt: text("created_at").notNull(),
}, table => [uniqueIndex("registered_carriers_slug").on(table.slug), uniqueIndex("registered_carriers_name_key").on(table.nameKey)]);
export const availability = sqliteTable("availability", {
  id: text("id").primaryKey(), carrier: text("carrier").notNull(), date: text("date").notNull(), cycle: text("cycle").notNull(),
  utilitarios: integer("utilitarios").notNull(), vans: integer("vans").notNull(), vucs: integer("vucs").notNull(), outros: integer("outros").notNull(),
  contact: text("contact").notNull(), notes: text("notes").notNull().default(""), revision: integer("revision").notNull().default(1),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, table => [uniqueIndex("availability_carrier_date_cycle").on(table.carrier, table.date, table.cycle)]);

export const carrierModals = sqliteTable("carrier_modals", {
  id: text("id").primaryKey(), carrier: text("carrier").notNull(), code: text("code").notNull(), name: text("name").notNull(),
  active: integer("active").notNull().default(1),
}, table => [uniqueIndex("carrier_modals_carrier_code").on(table.carrier, table.code)]);

export const modalCatalog = sqliteTable("modal_catalog", {
  id: text("id").primaryKey(), code: text("code").notNull(), name: text("name").notNull(),
  nameKey: text("name_key").notNull(), createdAt: text("created_at").notNull(),
  isFixedFleet: integer("is_fixed_fleet", { mode: "boolean" }).notNull().default(false),
  calendarizationType: text("calendarization_type").notNull().default("none"),
  sourceModalName: text("source_modal_name").notNull().default(""),
  revision: integer("revision").notNull().default(1), changeId: text("change_id"),
}, table => [uniqueIndex("modal_catalog_code").on(table.code), uniqueIndex("modal_catalog_name_key").on(table.nameKey)]);

export const carrierModalSettings = sqliteTable("carrier_modal_settings", {
  carrier: text("carrier").primaryKey(), revision: integer("revision").notNull().default(1),
  changeId: text("change_id"), updatedAt: text("updated_at").notNull(),
});

export const schedulingRequests = sqliteTable("scheduling_requests", {
  seq: integer("seq").primaryKey({ autoIncrement: true }), id: text("id").notNull(),
  carrier: text("carrier").notNull(), date: text("date").notNull(), cycle: text("cycle").notNull(),
  modalId: text("modal_id").notNull().references(() => carrierModals.id), modalName: text("modal_name").notNull(),
  quantity: integer("quantity").notNull(), contact: text("contact").notNull(), notes: text("notes").notNull().default(""),
  status: text("status").notNull().default("received"), createdAt: text("created_at").notNull(),
  resolutionNotes: text("resolution_notes").notNull().default(""), statusRevision: integer("status_revision").notNull().default(1),
  statusUpdatedAt: text("status_updated_at"), resolutionId: text("resolution_id"),
  ambulance: integer("ambulance", { mode: "boolean" }).notNull().default(false),
  ambulanceReleasedBy: text("ambulance_released_by").notNull().default(""),
  isFixedFleet: integer("is_fixed_fleet", { mode: "boolean" }).notNull().default(false),
  licensePlate: text("license_plate").notNull().default(""),
  licensePlates: text("license_plates").notNull().default("[]"),
  calendarVehicles: text("calendar_vehicles").notNull().default("[]"),
  calendarizationType: text("calendarization_type").notNull().default("none"),
  sourceModalName: text("source_modal_name").notNull().default(""),
  calendarStatus: text("calendar_status").notNull().default("not_applicable"),
  calendarNotes: text("calendar_notes").notNull().default(""),
  calendarCheckedAt: text("calendar_checked_at"), calendarSourceAt: text("calendar_source_at"),
  calendarPlanned: integer("calendar_planned"), calendarRequested: integer("calendar_requested"),
  calendarRevision: integer("calendar_revision").notNull().default(0),
}, table => [uniqueIndex("scheduling_requests_id").on(table.id), index("scheduling_requests_operation").on(table.carrier, table.date, table.cycle)]);

export const calendarizationCache = sqliteTable("calendarization_cache", {
  id: text("id").primaryKey(), payload: text("payload").notNull(),
  fetchedAt: text("fetched_at").notNull(), expiresAt: text("expires_at").notNull(),
});

export const schedulingStatusEvents = sqliteTable("scheduling_status_events", {
  seq: integer("seq").primaryKey({ autoIncrement: true }), changeId: text("change_id").notNull(),
  id: text("request_id").notNull().references(() => schedulingRequests.id), carrier: text("carrier").notNull(),
  date: text("date").notNull(), cycle: text("cycle").notNull(), modalName: text("modal_name").notNull(), quantity: integer("quantity").notNull(),
  status: text("status").notNull(), resolutionNotes: text("resolution_notes").notNull(),
  revision: integer("revision").notNull(), createdAt: text("created_at").notNull(),
}, table => [uniqueIndex("scheduling_status_change_id").on(table.changeId), uniqueIndex("scheduling_status_request_revision").on(table.id, table.revision), index("scheduling_status_carrier_seq").on(table.carrier, table.seq)]);
