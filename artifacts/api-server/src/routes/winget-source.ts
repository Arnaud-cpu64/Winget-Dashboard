import { Router, type IRouter } from "express";
import { eq, ilike, or, and, sql } from "drizzle-orm";
import yaml from "js-yaml";
import { db, packagesTable, packageVersionsTable } from "@workspace/db";
import type { Package, PackageVersion } from "@workspace/db";

const router: IRouter = Router();

/**
 * All versions of the REST source contract that this server supports.
 * The winget client picks the highest version from this list that it also supports.
 * Listing multiple versions ensures compatibility with older and newer winget clients.
 */
const SUPPORTED_VERSIONS = ["1.1.0", "1.4.0", "1.7.0"];

const ZERO_SHA256 = "0000000000000000000000000000000000000000000000000000000000000000";

// ---------------------------------------------------------------------------
// Manifest builders
// ---------------------------------------------------------------------------

function buildInstallerManifest(pkg: Package, ver?: PackageVersion) {
  const version = ver?.version ?? pkg.version;
  const url = ver?.installerUrl ?? pkg.installerUrl ?? pkg.homepage ?? "";
  const sha256 = ver?.installerSha256 ?? pkg.installerSha256 ?? ZERO_SHA256;
  const arch = ver?.architecture ?? "x64";
  const type = ver?.installerType ?? "exe";

  const installer: Record<string, unknown> = {
    Architecture: arch,
    InstallerType: type,
    Scope: "machine",
    InstallerUrl: url,
    InstallerSha256: sha256,
  };

  if (pkg.productCode) {
    installer.ProductCode = pkg.productCode;
  }

  return {
    PackageIdentifier: pkg.packageId,
    PackageVersion: version,
    Installers: [installer],
    ManifestType: "installer",
    ManifestVersion: "1.4.0",
  };
}

function buildDefaultLocaleManifest(pkg: Package, version: string) {
  return {
    PackageIdentifier: pkg.packageId,
    PackageVersion: version,
    PackageLocale: "en-US",
    Publisher: pkg.publisher,
    PackageName: pkg.name,
    License: pkg.license ?? "Unknown",
    ShortDescription: pkg.description ?? pkg.name,
    ManifestType: "defaultLocale",
    ManifestVersion: "1.4.0",
  };
}

function buildVersionManifest(pkg: Package, version: string) {
  return {
    PackageIdentifier: pkg.packageId,
    PackageVersion: version,
    DefaultLocale: "en-US",
    ManifestType: "version",
    ManifestVersion: "1.4.0",
  };
}

function buildDefaultLocaleShort(pkg: Package) {
  return {
    PackageLocale: "en-US",
    Publisher: pkg.publisher,
    PackageName: pkg.name,
    License: pkg.license ?? "Unknown",
    ShortDescription: pkg.description ?? pkg.name,
  };
}

function buildVersionEntry(version: string, pkg: Package) {
  return {
    PackageVersion: version,
    DefaultLocale: buildDefaultLocaleShort(pkg),
    Channel: "",
  };
}

function buildManifests(pkg: Package, version: string, versionRow: PackageVersion | null) {
  const versionManifest = buildVersionManifest(pkg, version);
  const defaultLocaleManifest = buildDefaultLocaleManifest(pkg, version);
  const installerManifest = buildInstallerManifest(pkg, versionRow ?? undefined);

  return {
    VersionManifest: yaml.dump(versionManifest, { lineWidth: -1 }),
    DefaultLocaleManifest: yaml.dump(defaultLocaleManifest, { lineWidth: -1 }),
    LocaleManifests: [],
    InstallerManifest: yaml.dump(installerManifest, { lineWidth: -1 }),
  };
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

async function resolveVersions(pkg: Package): Promise<string[]> {
  const rows = await db
    .select()
    .from(packageVersionsTable)
    .where(eq(packageVersionsTable.packageId, pkg.id));

  return rows.length > 0 ? rows.map((r) => r.version) : [pkg.version];
}

async function resolveVersionRow(
  pkg: Package,
  requestedVersion: string,
): Promise<{ found: false } | { found: true; versionRow: PackageVersion | null }> {
  const rows = await db
    .select()
    .from(packageVersionsTable)
    .where(and(eq(packageVersionsTable.packageId, pkg.id), eq(packageVersionsTable.version, requestedVersion)));

  if (rows.length > 0) return { found: true, versionRow: rows[0] ?? null };
  if (pkg.version === requestedVersion) return { found: true, versionRow: null };
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
 *
 * Semantics (from the REST source contract):
 *   - Query       → broad OR search across name/publisher/id
 *   - Inclusions  → OR between items, combined as OR with Query
 *   - Filters     → AND between items, restricts the above results
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

    // Build the broad OR clause from Query + Inclusions
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

    // Build the AND clauses from Filters
    const andClauses: ReturnType<typeof buildFilterCondition>[] = [];
    for (const f of body?.Filters ?? []) {
      const cond = buildFilterCondition(f);
      if (cond) andClauses.push(cond);
    }

    // Combine: (OR clauses) AND (filter clauses)
    const whereClause = (() => {
      const broad = orClauses.length > 0 ? or(...orClauses) : undefined;
      const restrict = andClauses.length > 0 ? and(...andClauses) : undefined;

      if (broad && restrict) return and(broad, restrict);
      if (broad) return broad;
      if (restrict) return restrict;
      return undefined; // no filter → return all
    })();

    const packages = await (whereClause
      ? db.select().from(packagesTable).where(whereClause).limit(maxResults)
      : db.select().from(packagesTable).limit(maxResults));

    const data = await Promise.all(
      packages.map(async (pkg) => {
        const versions = await resolveVersions(pkg);
        return {
          PackageIdentifier: pkg.packageId,
          PackageName: pkg.name,
          Publisher: pkg.publisher,
          Versions: versions.map((v) => buildVersionEntry(v, pkg)),
        };
      }),
    );

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
 * Returns all versions with full YAML manifests.
 */
router.get("/packageManifests/:packageIdentifier", async (req, res): Promise<void> => {
  try {
    const { packageIdentifier } = req.params;
    req.log.debug({ packageIdentifier }, "[winget] packageManifests");

    const pkg = await findPackage(packageIdentifier);
    if (!pkg) {
      // winget expects 204 No Content when a package is not found
      res.status(204).end();
      return;
    }

    const versions = await resolveVersions(pkg);

    const versionData = (
      await Promise.all(
        versions.map(async (version) => {
          const resolved = await resolveVersionRow(pkg, version);
          if (!resolved.found) return null;
          return {
            PackageVersion: version,
            DefaultLocale: buildDefaultLocaleShort(pkg),
            Channel: "",
            Manifests: buildManifests(pkg, version, resolved.versionRow),
          };
        }),
      )
    ).filter(Boolean);

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

    const resolved = await resolveVersionRow(pkg, packageVersionId);
    if (!resolved.found) {
      res.status(204).end();
      return;
    }

    res.json({
      Data: {
        PackageIdentifier: pkg.packageId,
        Versions: [
          {
            PackageVersion: resolved.versionRow?.version ?? pkg.version,
            DefaultLocale: buildDefaultLocaleShort(pkg),
            Channel: "",
            Manifests: buildManifests(pkg, resolved.versionRow?.version ?? pkg.version, resolved.versionRow),
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
