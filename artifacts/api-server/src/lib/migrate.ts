import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

/**
 * Safe, idempotent schema migrations.
 * Uses ADD COLUMN IF NOT EXISTS — safe to run on every startup.
 * Required because the Docker runner image does not include drizzle-kit.
 */
export async function migrateSchema(): Promise<void> {
  const stmts: string[] = [
    // v1.0.22 — packages: locale metadata
    `ALTER TABLE packages ADD COLUMN IF NOT EXISTS license_url           TEXT`,
    `ALTER TABLE packages ADD COLUMN IF NOT EXISTS publisher_url         TEXT`,
    `ALTER TABLE packages ADD COLUMN IF NOT EXISTS publisher_support_url TEXT`,
    `ALTER TABLE packages ADD COLUMN IF NOT EXISTS privacy_url           TEXT`,
    `ALTER TABLE packages ADD COLUMN IF NOT EXISTS author                TEXT`,
    `ALTER TABLE packages ADD COLUMN IF NOT EXISTS copyright             TEXT`,
    `ALTER TABLE packages ADD COLUMN IF NOT EXISTS copyright_url         TEXT`,
    `ALTER TABLE packages ADD COLUMN IF NOT EXISTS moniker               TEXT`,
    `ALTER TABLE packages ADD COLUMN IF NOT EXISTS tags                  TEXT`,

    // v1.0.22 — package_versions: installer metadata
    `ALTER TABLE package_versions ADD COLUMN IF NOT EXISTS installer_locale     TEXT`,
    `ALTER TABLE package_versions ADD COLUMN IF NOT EXISTS platform             TEXT`,
    `ALTER TABLE package_versions ADD COLUMN IF NOT EXISTS minimum_os_version   TEXT`,
    `ALTER TABLE package_versions ADD COLUMN IF NOT EXISTS package_family_name  TEXT`,
    `ALTER TABLE package_versions ADD COLUMN IF NOT EXISTS install_modes        TEXT`,

    // v1.0.21 — package_versions: extended installer fields (backfill guard)
    `ALTER TABLE package_versions ADD COLUMN IF NOT EXISTS upgrade_code                  TEXT`,
    `ALTER TABLE package_versions ADD COLUMN IF NOT EXISTS silent_switch                 TEXT`,
    `ALTER TABLE package_versions ADD COLUMN IF NOT EXISTS silent_with_progress_switch   TEXT`,
    `ALTER TABLE package_versions ADD COLUMN IF NOT EXISTS install_location_switch       TEXT`,
    `ALTER TABLE package_versions ADD COLUMN IF NOT EXISTS upgrade_behavior              TEXT DEFAULT 'install'`,
    `ALTER TABLE package_versions ADD COLUMN IF NOT EXISTS scope                         TEXT DEFAULT 'machine'`,
    `ALTER TABLE package_versions ADD COLUMN IF NOT EXISTS release_date                  DATE`,
    `ALTER TABLE package_versions ADD COLUMN IF NOT EXISTS elevation_requirement         TEXT`,

    // v1.0.21 — packages: productCode
    `ALTER TABLE packages ADD COLUMN IF NOT EXISTS product_code TEXT`,
  ];

  for (const stmt of stmts) {
    await db.execute(sql.raw(stmt));
  }
}
