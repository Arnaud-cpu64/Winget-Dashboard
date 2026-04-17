import { Router, type IRouter } from "express";
import { eq, ilike, or, and, sql, inArray } from "drizzle-orm";
import { db, packagesTable, packageVersionsTable } from "@workspace/db";
import type { Package, PackageVersion } from "@workspace/db";
import { fetchInstallerManifest } from "./winget";

const router: IRouter = Router();

/**
 * All versions of the REST source contract that this server supports.
 * The winget client picks the highest version from this list that it also supports.
 * Listing multiple versions ensures compatibility with older and newer winget clients.
 */
const SUPPORTED_VERSIONS = ["1.1.0", "1.4.0", "1.7.0"];

// ---------------------------------------------------------------------------
// Manifest builders
// ---------------------------------------------------------------------------

/**
 * Build a single installer JSON object for one architecture row.
 * Returns a proper JSON object as required by the winget REST API spec.
 */
function buildInstallerEntry(pkg: Package, ver: PackageVersion): Record<string, unknown> {
  const url = ver.installerUrl ?? pkg.installerUrl ?? pkg.homepage ?? "";
  const sha256 = ver.installerSha256 ?? pkg.installerSha256 ?? "";
  const arch = ver.architecture ?? "x64";
  const type = ver.installerType ?? "exe";
  const scope = ver.scope ?? "machine";
  const productCode = ver.productCode ?? pkg.productCode;

  const installer: Record<string, unknown> = {
    Architecture: arch,
    InstallerType: type,
    InstallerUrl: url,
    InstallerSha256: sha256,
    Scope: scope,
  };

  if (ver.installerLocale) installer.InstallerLocale = ver.installerLocale;
  if (ver.platform) installer.Platform = [ver.platform];
  if (ver.minimumOsVersion) installer.MinimumOSVersion = ver.minimumOsVersion;
  if (ver.packageFamilyName) installer.PackageFamilyName = ver.packageFamilyName;
  if (productCode) installer.ProductCode = productCode;
  if (ver.upgradeCode) installer.UpgradeCode = ver.upgradeCode;
  if (ver.upgradeBehavior) installer.UpgradeBehavior = ver.upgradeBehavior;
  if (ver.releaseDate) installer.ReleaseDate = ver.releaseDate;

  if (ver.installModes) {
    installer.InstallModes = ver.installModes.split(",").map((m) => m.trim()).filter(Boolean);
  }

  const silent = ver.silentSwitch;
  const silentProgress = ver.silentWithProgressSwitch;
  const installLocation = ver.installLocationSwitch;
  if (silent || silentProgress || installLocation) {
    const switches: Record<string, string> = {};
    if (silent) switches.Silent = silent;
    if (silentProgress) switches.SilentWithProgress = silentProgress;
    if (installLocation) switches.InstallLocation = installLocation;
    installer.InstallerSwitches = switches;
  }

  if (ver.elevationRequirement) installer.ElevationRequirement = ver.elevationRequirement;

  return installer;
}

/**
 * Build the DefaultLocale JSON object for a package.
 * Used in both manifestSearch (short) and packageManifests (full) responses.
 */
function buildDefaultLocale(pkg: Package) {
  const locale: Record<string, unknown> = {
    PackageLocale: "en-US",
    Publisher: pkg.publisher,
    PackageName: pkg.name,
    License: pkg.license ?? "Unknown",
    ShortDescription: pkg.description ?? pkg.name,
  };

  if (pkg.publisherUrl) locale.PublisherUrl = pkg.publisherUrl;
  if (pkg.publisherSupportUrl) locale.PublisherSupportUrl = pkg.publisherSupportUrl;
  if (pkg.privacyUrl) locale.PrivacyUrl = pkg.privacyUrl;
  if (pkg.author) locale.Author = pkg.author;
  if (pkg.homepage) locale.PackageUrl = pkg.homepage;
  if (pkg.licenseUrl) locale.LicenseUrl = pkg.licenseUrl;
  if (pkg.copyright) locale.Copyright = pkg.copyright;
  if (pkg.copyrightUrl) locale.CopyrightUrl = pkg.copyrightUrl;
  if (pkg.moniker) locale.Moniker = pkg.moniker;
  if (pkg.tags) locale.Tags = pkg.tags.split(",").map((t) => t.trim()).filter(Boolean);

  return locale;
}

function buildVersionEntry(version: string, pkg: Package) {
  return {
    PackageVersion: version,
    DefaultLocale: buildDefaultLocale(pkg),
    Channel: "",
  };
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

/** Returns true if the given version string is a real (winget-compatible) version. */
function isValidVersion(v: string): boolean {
  return v.trim() !== "" && v.toLowerCase() !== "latest";
}

/**
 * Lazily fetch and persist installer manifest data for a package that has no
 * version rows yet (added before auto-fetch was introduced).
 */
async function lazyFetchVersionRows(pkg: Package, version: string): Promise<PackageVersion[]> {
  if (!isValidVersion(version)) return [];
  try {
    const entries = await fetchInstallerManifest(pkg.packageId, version);
    if (entries.length === 0) return [];

    // Remove stale rows that have no installer URL (old fallback rows) so that the
    // upcoming insert can replace them with correct data without hitting unique conflicts.
    const existingRows = await db.select().from(packageVersionsTable).where(
      and(eq(packageVersionsTable.packageId, pkg.id), eq(packageVersionsTable.version, version)),
    );
    const staleIds = existingRows
      .filter((r) => !r.installerUrl || r.installerUrl.trim() === "")
      .map((r) => r.id);
    if (staleIds.length > 0) {
      await db.delete(packageVersionsTable).where(inArray(packageVersionsTable.id, staleIds));
    }

    await db.insert(packageVersionsTable).values(
      entries.map((e) => ({
        packageId: pkg.id,
        version,
        installerUrl: e.installerUrl,
        installerSha256: e.installerSha256,
        installerType: e.installerType,
        architecture: e.architecture,
        scope: e.scope,
        productCode: e.productCode,
        upgradeCode: e.upgradeCode,
        packageFamilyName: e.packageFamilyName,
        silentSwitch: e.silentSwitch,
        silentWithProgressSwitch: e.silentWithProgressSwitch,
        installLocationSwitch: e.installLocationSwitch,
        installModes: e.installModes,
        upgradeBehavior: e.upgradeBehavior,
        minimumOsVersion: e.minimumOsVersion,
        installerLocale: e.installerLocale,
        releaseDate: e.releaseDate,
        elevationRequirement: e.elevationRequirement,
      })),
    ).onConflictDoNothing();

    // Re-fetch from DB to get the persisted rows (with IDs, addedAt, etc.)
    return db.select().from(packageVersionsTable).where(
      and(
        eq(packageVersionsTable.packageId, pkg.id),
        eq(packageVersionsTable.version, version),
        sql`${packageVersionsTable.installerUrl} IS NOT NULL`,
      ),
    );
  } catch {
    return [];
  }
}

/**
 * Returns the list of servable versions for a package (deduplicated).
 * "latest" is NOT a valid winget version and is always excluded.
 * Falls back to the package-level version only if it has a real installer URL.
 */
async function resolveVersions(pkg: Package): Promise<string[]> {
  const rows = await db
    .select()
    .from(packageVersionsTable)
    .where(eq(packageVersionsTable.packageId, pkg.id));

  if (rows.length > 0) {
    const valid = rows.filter((r) => isValidVersion(r.version) && r.installerUrl);
    const stale = rows.filter((r) => !r.installerUrl || r.installerUrl.trim() === "");

    // Remove stale rows (no installer URL) and re-fetch to fill any gaps
    if (stale.length > 0 && isValidVersion(pkg.version)) {
      const staleIds = stale.map((r) => r.id);
      try {
        await db.delete(packageVersionsTable).where(inArray(packageVersionsTable.id, staleIds));
        // Re-fetch manifest to fill missing architectures (uses onConflictDoNothing,
        // so already-correct rows like x86/arm64 won't be overwritten)
        await lazyFetchVersionRows(pkg, pkg.version);
      } catch { /* ignore errors, serve what we have */ }

      // Re-read from DB after cleanup+refetch
      const refreshed = await db
        .select()
        .from(packageVersionsTable)
        .where(and(eq(packageVersionsTable.packageId, pkg.id), sql`${packageVersionsTable.installerUrl} IS NOT NULL`));
      const uniqueVersions = [...new Set(
        refreshed.filter((r) => isValidVersion(r.version)).map((r) => r.version),
      )];
      if (uniqueVersions.length > 0) return uniqueVersions;
    }

    const uniqueVersions = [...new Set(valid.map((r) => r.version))];
    if (uniqueVersions.length > 0) return uniqueVersions;
  }

  // Package-level fallback: only if version is real and installer URL is set
  if (isValidVersion(pkg.version) && pkg.installerUrl) {
    return [pkg.version];
  }

  // Last resort: try a lazy fetch if we have a real version but no installer data
  if (isValidVersion(pkg.version)) {
    const fetched = await lazyFetchVersionRows(pkg, pkg.version);
    if (fetched.length > 0) {
      return [pkg.version];
    }
  }

  return [];
}

/**
 * Returns all version rows for a specific version of a package.
 * Multiple rows = multiple architectures.
 */
async function resolveVersionRows(
  pkg: Package,
  requestedVersion: string,
): Promise<{ found: false } | { found: true; versionRows: PackageVersion[] }> {
  const rows = await db
    .select()
    .from(packageVersionsTable)
    .where(and(eq(packageVersionsTable.packageId, pkg.id), eq(packageVersionsTable.version, requestedVersion)));

  // Only keep rows that have a valid installer URL (filter stale empty-fallback rows)
  const validRows = rows.filter((r) => r.installerUrl && r.installerUrl.trim() !== "");
  if (validRows.length > 0) return { found: true, versionRows: validRows };

  // Package-level fallback
  if (pkg.version === requestedVersion && pkg.installerUrl) {
    return { found: true, versionRows: [] };
  }

  // Lazy fetch
  if (pkg.version === requestedVersion && isValidVersion(requestedVersion)) {
    const fetched = await lazyFetchVersionRows(pkg, requestedVersion);
    if (fetched.length > 0) return { found: true, versionRows: fetched };
  }

  return { found: false };
}

/** Case-insensitive exact lookup of a package by its packageId. */
async function findPackage(packageIdentifier: string): Promise<Package | undefined> {
  const rows = await db
    .select()
    .from(packagesTable)
    .where(sql`lower(${packagesTable.packageId}) = lower(${packageIdentifier})`);
  return rows[0];
}

// ---------------------------------------------------------------------------
// Search helpers — respect MatchType and Filters vs Inclusions semantics
// ---------------------------------------------------------------------------

type MatchFilter = {
  PackageMatchField: string;
  RequestMatch: { KeyWord: string; MatchType: string };
};

function buildFilterCondition(filter: MatchFilter) {
  const kw = filter.RequestMatch?.KeyWord ?? "";
  const matchType = filter.RequestMatch?.MatchType ?? "Substring";
  const field = filter.PackageMatchField;

  const exact = (col: Parameters<typeof ilike>[0]) =>
    sql`lower(${col}) = lower(${kw})`;
  const partial = (col: Parameters<typeof ilike>[0]) =>
    ilike(col, `%${kw}%`);
  const match = matchType === "Exact" || matchType === "CaseInsensitive" ? exact : partial;

  switch (field) {
    case "PackageIdentifier":
      return match(packagesTable.packageId);
    case "PackageName":
      return match(packagesTable.name);
    case "Publisher":
      return match(packagesTable.publisher);
    case "Keyword":
    case "Tag":
    case "Command":
    case "Moniker":
    default:
      return or(
        partial(packagesTable.name),
        partial(packagesTable.publisher),
        partial(packagesTable.packageId),
      );
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * GET /winget/information
 * Source negotiation — called first by every winget command.
 */
router.get("/information", (_req, res) => {
  res.json({
    Data: {
      SourceIdentifier: "winget-local-repo",
      ServerSupportedVersions: SUPPORTED_VERSIONS,
      Authentication: {
        AuthenticationType: "none",
      },
      UnsupportedPackageMatchFields: [],
      RequiredPackageMatchFields: [],
      UnsupportedQueryParameters: [],
      RequiredQueryParameters: [],
    },
  });
});

/**
 * POST /winget/manifestSearch
 * Called by: winget search, winget show, winget install, winget upgrade, winget list
 */
router.post("/manifestSearch", async (req, res): Promise<void> => {
  try {
    const body = req.body as {
      Query?: { KeyWord?: string; MatchType?: string };
      Filters?: MatchFilter[];
      Inclusions?: MatchFilter[];
      MaximumResults?: number;
      FetchAllManifests?: boolean;
    };

    req.log.debug({ body }, "[winget] manifestSearch");

    const maxResults = body?.MaximumResults ?? 50;

    const orClauses: ReturnType<typeof buildFilterCondition>[] = [];

    const keyword = body?.Query?.KeyWord ?? "";
    if (keyword) {
      orClauses.push(
        or(
          ilike(packagesTable.name, `%${keyword}%`),
          ilike(packagesTable.publisher, `%${keyword}%`),
          ilike(packagesTable.packageId, `%${keyword}%`),
        ) as ReturnType<typeof buildFilterCondition>,
      );
    }

    for (const inc of body?.Inclusions ?? []) {
      const cond = buildFilterCondition(inc);
      if (cond) orClauses.push(cond);
    }

    const andClauses: ReturnType<typeof buildFilterCondition>[] = [];
    for (const f of body?.Filters ?? []) {
      const cond = buildFilterCondition(f);
      if (cond) andClauses.push(cond);
    }

    const whereClause = (() => {
      const broad = orClauses.length > 0 ? or(...orClauses) : undefined;
      const restrict = andClauses.length > 0 ? and(...andClauses) : undefined;

      if (broad && restrict) return and(broad, restrict);
      if (broad) return broad;
      if (restrict) return restrict;
      return undefined;
    })();

    const packages = await (whereClause
      ? db.select().from(packagesTable).where(whereClause).limit(maxResults)
      : db.select().from(packagesTable).limit(maxResults));

    const resolved = await Promise.all(
      packages.map(async (pkg) => {
        const versions = await resolveVersions(pkg);
        return { pkg, versions };
      }),
    );

    const data = resolved
      .filter(({ versions }) => versions.length > 0)
      .map(({ pkg, versions }) => ({
        PackageIdentifier: pkg.packageId,
        PackageName: pkg.name,
        Publisher: pkg.publisher,
        Versions: versions.map((v) => buildVersionEntry(v, pkg)),
      }));

    res.json({
      Data: data,
      RequiredPackageMatchFields: [],
      UnsupportedPackageMatchFields: [],
    });
  } catch (err) {
    req.log.error({ err }, "[winget] manifestSearch error");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /winget/packageManifests/:packageIdentifier
 * Called by: winget show, winget install, winget upgrade, winget download
 */
router.get("/packageManifests/:packageIdentifier", async (req, res): Promise<void> => {
  try {
    const { packageIdentifier } = req.params;
    req.log.debug({ packageIdentifier }, "[winget] packageManifests");

    const pkg = await findPackage(packageIdentifier);
    if (!pkg) {
      res.status(204).end();
      return;
    }

    const versions = await resolveVersions(pkg);

    if (versions.length === 0) {
      res.status(204).end();
      return;
    }

    const versionData = (
      await Promise.all(
        versions.map(async (version) => {
          const resolved = await resolveVersionRows(pkg, version);
          if (!resolved.found) return null;

          // If package-level fallback with no version rows, build a synthetic row
          const rows: PackageVersion[] = resolved.versionRows.length > 0
            ? resolved.versionRows
            : pkg.installerUrl
              ? [{
                  id: -1,
                  packageId: pkg.id,
                  version,
                  installerUrl: pkg.installerUrl,
                  installerSha256: pkg.installerSha256,
                  installerType: "exe",
                  architecture: "x64",
                  scope: "machine",
                  platform: null,
                  minimumOsVersion: null,
                  packageFamilyName: null,
                  productCode: pkg.productCode,
                  upgradeCode: null,
                  silentSwitch: null,
                  silentWithProgressSwitch: null,
                  installLocationSwitch: null,
                  installModes: null,
                  upgradeBehavior: "install",
                  elevationRequirement: null,
                  installerLocale: null,
                  releaseDate: null,
                  addedAt: new Date(),
                } as PackageVersion]
              : [];

          if (rows.length === 0) return null;

          return {
            PackageVersion: version,
            Channel: "",
            DefaultLocale: buildDefaultLocale(pkg),
            Locales: [],
            Installers: rows.map((ver) => buildInstallerEntry(pkg, ver)),
          };
        }),
      )
    ).filter(Boolean);

    if (versionData.length === 0) {
      res.status(204).end();
      return;
    }

    res.json({
      Data: {
        PackageIdentifier: pkg.packageId,
        Versions: versionData,
      },
    });
  } catch (err) {
    req.log.error({ err }, "[winget] packageManifests error");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /winget/packageManifests/:packageIdentifier/:packageVersionId
 * Called by: winget install <id> --version <v>, winget show <id> --version <v>
 */
router.get("/packageManifests/:packageIdentifier/:packageVersionId", async (req, res): Promise<void> => {
  try {
    const { packageIdentifier, packageVersionId } = req.params;
    req.log.debug({ packageIdentifier, packageVersionId }, "[winget] packageManifests/version");

    const pkg = await findPackage(packageIdentifier);
    if (!pkg) {
      res.status(204).end();
      return;
    }

    const resolved = await resolveVersionRows(pkg, packageVersionId);
    if (!resolved.found) {
      res.status(204).end();
      return;
    }

    const rows: PackageVersion[] = resolved.versionRows.length > 0
      ? resolved.versionRows
      : pkg.installerUrl
        ? [{
            id: -1,
            packageId: pkg.id,
            version: packageVersionId,
            installerUrl: pkg.installerUrl,
            installerSha256: pkg.installerSha256,
            installerType: "exe",
            architecture: "x64",
            scope: "machine",
            platform: null,
            minimumOsVersion: null,
            packageFamilyName: null,
            productCode: pkg.productCode,
            upgradeCode: null,
            silentSwitch: null,
            silentWithProgressSwitch: null,
            installLocationSwitch: null,
            installModes: null,
            upgradeBehavior: "install",
            elevationRequirement: null,
            installerLocale: null,
            releaseDate: null,
            addedAt: new Date(),
          } as PackageVersion]
        : [];

    if (rows.length === 0) {
      res.status(204).end();
      return;
    }

    res.json({
      Data: {
        PackageIdentifier: pkg.packageId,
        Versions: [
          {
            PackageVersion: packageVersionId,
            DefaultLocale: buildDefaultLocaleShort(pkg),
            Channel: "",
            Manifests: buildManifests(pkg, packageVersionId, rows),
          },
        ],
      },
    });
  } catch (err) {
    req.log.error({ err }, "[winget] packageManifests/version error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
