import { pgTable, text, serial, integer, timestamp, unique, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { packagesTable } from "./packages";

export const packageVersionsTable = pgTable(
  "package_versions",
  {
    id: serial("id").primaryKey(),
    packageId: integer("package_id")
      .notNull()
      .references(() => packagesTable.id, { onDelete: "cascade" }),
    version: text("version").notNull(),
    installerUrl: text("installer_url"),
    installerSha256: text("installer_sha256"),
    installerType: text("installer_type").default("exe"),
    architecture: text("architecture").default("x64"),
    productCode: text("product_code"),
    upgradeCode: text("upgrade_code"),
    silentSwitch: text("silent_switch"),
    silentWithProgressSwitch: text("silent_with_progress_switch"),
    installLocationSwitch: text("install_location_switch"),
    upgradeBehavior: text("upgrade_behavior").default("install"),
    scope: text("scope").default("machine"),
    releaseDate: date("release_date"),
    elevationRequirement: text("elevation_requirement"),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("package_versions_package_id_version_unique").on(t.packageId, t.version)],
);

export const insertPackageVersionSchema = createInsertSchema(packageVersionsTable).omit({
  id: true,
  addedAt: true,
});
export type InsertPackageVersion = z.infer<typeof insertPackageVersionSchema>;
export type PackageVersion = typeof packageVersionsTable.$inferSelect;
