import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const packagesTable = pgTable("packages", {
  id: serial("id").primaryKey(),
  packageId: text("package_id").notNull().unique(),
  name: text("name").notNull(),
  publisher: text("publisher").notNull(),
  version: text("version").notNull(),

  // --- DefaultLocaleManifest metadata ---
  description: text("description"),
  license: text("license"),
  licenseUrl: text("license_url"),
  homepage: text("homepage"),
  publisherUrl: text("publisher_url"),
  publisherSupportUrl: text("publisher_support_url"),
  privacyUrl: text("privacy_url"),
  author: text("author"),
  copyright: text("copyright"),
  copyrightUrl: text("copyright_url"),
  moniker: text("moniker"),
  tags: text("tags"),

  // --- Default installer fields (overridden per version in package_versions) ---
  installerUrl: text("installer_url"),
  installerSha256: text("installer_sha256"),
  productCode: text("product_code"),

  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPackageSchema = createInsertSchema(packagesTable).omit({ id: true, addedAt: true });
export type InsertPackage = z.infer<typeof insertPackageSchema>;
export type Package = typeof packagesTable.$inferSelect;
