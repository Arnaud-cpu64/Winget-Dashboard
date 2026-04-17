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

    // --- Installer binary ---
    installerUrl: text("installer_url"),
    installerSha256: text("installer_sha256"),
    installerType: text("installer_type").default("exe"),
    installerLocale: text("installer_locale"),

    // --- Architecture & platform ---
    architecture: text("architecture").default("x64"),
    platform: text("platform"),
    minimumOsVersion: text("minimum_os_version"),

    // --- Package family (MSIX) ---
    packageFamilyName: text("package_family_name"),

    // --- Identity for upgrade / uninstall ---
    productCode: text("product_code"),
    upgradeCode: text("upgrade_code"),

    // --- Installer switches ---
    silentSwitch: text("silent_switch"),
    silentWithProgressSwitch: text("silent_with_progress_switch"),
    installLocationSwitch: text("install_location_switch"),

    // --- Install behaviour ---
    installModes: text("install_modes"),
    upgradeBehavior: text("upgrade_behavior").default("install"),
    scope: text("scope").default("machine"),
    elevationRequirement: text("elevation_requirement"),

    // --- Metadata ---
    releaseDate: date("release_date"),

    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("package_versions_package_id_version_arch_unique").on(t.packageId, t.version, t.architecture)],
);

export const insertPackageVersionSchema = createInsertSchema(packageVersionsTable).omit({
  id: true,
  addedAt: true,
});
export type InsertPackageVersion = z.infer<typeof insertPackageVersionSchema>;
export type PackageVersion = typeof packageVersionsTable.$inferSelect;
