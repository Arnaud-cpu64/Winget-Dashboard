import { Router, type IRouter } from "express";
import { eq, ilike, or, and } from "drizzle-orm";
import yaml from "js-yaml";
import { db, packagesTable, packageVersionsTable } from "@workspace/db";
import type { Package, PackageVersion } from "@workspace/db";

const router: IRouter = Router();

const API_VERSION = "1.1.0";
const SUPPORTED_CONTRACTS = [
  {
    ContractName: "com.microsoft.winget.contract.packages",
    ContractVersion: "1.0.0",
  },
];

const ZERO_SHA256 = "0000000000000000000000000000000000000000000000000000000000000000";

function buildPackageIdentifier(pkg: Package): string {
  return pkg.packageId;
}

function buildInstallerManifestFromVersion(pkg: Package, ver: PackageVersion) {
  return {
    PackageIdentifier: pkg.packageId,
    PackageVersion: ver.version,
    Installers: [
      {
        Architecture: ver.architecture ?? "x64",
        InstallerType: ver.installerType ?? "exe",
        InstallerUrl: ver.installerUrl ?? pkg.installerUrl ?? pkg.homepage ?? "",
        InstallerSha256: ver.installerSha256 ?? pkg.installerSha256 ?? ZERO_SHA256,
      },
    ],
    ManifestType: "installer",
    ManifestVersion: "1.4.0",
  };
}

function buildInstallerManifest(pkg: Package) {
  return {
    PackageIdentifier: pkg.packageId,
    PackageVersion: pkg.version,
    Installers: [
      {
        Architecture: "x64",
        InstallerType: "exe",
        InstallerUrl: pkg.installerUrl ?? pkg.homepage ?? "",
        InstallerSha256: pkg.installerSha256 ?? ZERO_SHA256,
      },
    ],
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

function buildVersionEntry(version: string) {
  return {
    PackageVersion: version,
    DefaultLocale: "en-US",
    Channel: null,
  };
}

/**
 * Resolves all available versions for a package.
 * Returns versions from the package_versions table if any exist,
 * otherwise falls back to the version field on the package row itself.
 */
async function resolveVersions(pkg: Package): Promise<string[]> {
  const rows = await db
    .select()
    .from(packageVersionsTable)
    .where(eq(packageVersionsTable.packageId, pkg.id));

  if (rows.length > 0) {
    return rows.map((r) => r.version);
  }
  return [pkg.version];
}

/**
 * Resolves a specific version record, or falls back to the package row.
 * Returns { found: true, versionRow?, version } or { found: false }.
 */
async function resolveVersion(
  pkg: Package,
  requestedVersion: string,
): Promise<{ found: false } | { found: true; versionRow: PackageVersion | null; version: string }> {
  const rows = await db
    .select()
    .from(packageVersionsTable)
    .where(and(eq(packageVersionsTable.packageId, pkg.id), eq(packageVersionsTable.version, requestedVersion)));

  if (rows.length > 0) {
    return { found: true, versionRow: rows[0] ?? null, version: requestedVersion };
  }

  if (pkg.version === requestedVersion) {
    return { found: true, versionRow: null, version: requestedVersion };
  }

  return { found: false };
}

/**
 * GET /winget/information
 * Returns the API version and supported contracts.
 * Required by winget client during source initialization.
 */
router.get("/information", (_req, res) => {
  res.json({
    Data: {
      SourceIdentifier: "winget-local-repo",
      ServerSupportedVersions: [API_VERSION],
      Authentication: {
        AuthenticationType: "none",
      },
      UnsupportedPackageMatchFields: [],
      RequiredPackageMatchFields: [],
      UnsupportedQueryParameters: [],
      RequiredQueryParameters: [],
    },
    SupportedContracts: SUPPORTED_CONTRACTS,
  });
});

/**
 * POST /winget/packages/search
 * Winget v1 protocol uses POST for package search with a body.
 * Supports filtering by PackageName, Publisher, PackageIdentifier, and keyword.
 */
router.post("/packages/search", async (req, res): Promise<void> => {
  try {
    const body = req.body as {
      Query?: { KeyWord?: string; MatchType?: string };
      Filters?: Array<{ PackageMatchField: string; RequestMatch: { KeyWord: string; MatchType: string } }>;
      Inclusions?: Array<{ PackageMatchField: string; RequestMatch: { KeyWord: string; MatchType: string } }>;
      MaximumResults?: number;
      FetchAllManifests?: boolean;
    };

    const maxResults = body?.MaximumResults ?? 30;
    const keyword = body?.Query?.KeyWord ?? "";

    const conditions = [];

    if (keyword) {
      conditions.push(
        or(
          ilike(packagesTable.name, `%${keyword}%`),
          ilike(packagesTable.publisher, `%${keyword}%`),
          ilike(packagesTable.packageId, `%${keyword}%`),
        ),
      );
    }

    const filters = [...(body?.Filters ?? []), ...(body?.Inclusions ?? [])];
    for (const filter of filters) {
      const kw = filter.RequestMatch?.KeyWord ?? "";
      if (!kw) continue;
      const field = filter.PackageMatchField;
      if (field === "PackageName") {
        conditions.push(ilike(packagesTable.name, `%${kw}%`));
      } else if (field === "Publisher") {
        conditions.push(ilike(packagesTable.publisher, `%${kw}%`));
      } else if (field === "PackageIdentifier") {
        conditions.push(ilike(packagesTable.packageId, `%${kw}%`));
      } else if (field === "Keyword" || field === "Tag" || field === "Command") {
        conditions.push(
          or(
            ilike(packagesTable.name, `%${kw}%`),
            ilike(packagesTable.publisher, `%${kw}%`),
            ilike(packagesTable.packageId, `%${kw}%`),
          ),
        );
      }
    }

    let packages: Package[];
    if (conditions.length > 0) {
      packages = await db
        .select()
        .from(packagesTable)
        .where(or(...conditions))
        .limit(maxResults);
    } else {
      packages = await db.select().from(packagesTable).limit(maxResults);
    }

    const data = await Promise.all(
      packages.map(async (pkg) => {
        const versions = await resolveVersions(pkg);
        return {
          PackageIdentifier: buildPackageIdentifier(pkg),
          PackageName: pkg.name,
          Publisher: pkg.publisher,
          Versions: versions.map(buildVersionEntry),
        };
      }),
    );

    res.json({
      Data: data,
      RequiredPackageMatchFields: [],
      UnsupportedPackageMatchFields: [],
    });
  } catch (err) {
    req.log.error({ err }, "Error searching winget packages");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /winget/packages
 * Lists all packages with optional pagination and filters.
 */
router.get("/packages", async (req, res): Promise<void> => {
  try {
    const { name, publisher, version, continuationToken, limit: limitStr } = req.query as Record<string, string>;
    const limit = Math.min(parseInt(limitStr ?? "20", 10) || 20, 100);
    const offset = continuationToken ? parseInt(continuationToken, 10) || 0 : 0;

    const conditions = [];
    if (name) conditions.push(ilike(packagesTable.name, `%${name}%`));
    if (publisher) conditions.push(ilike(packagesTable.publisher, `%${publisher}%`));
    if (version) conditions.push(ilike(packagesTable.version, `%${version}%`));

    let packages: Package[];
    if (conditions.length > 0) {
      packages = await db
        .select()
        .from(packagesTable)
        .where(and(...conditions))
        .limit(limit + 1)
        .offset(offset);
    } else {
      packages = await db.select().from(packagesTable).limit(limit + 1).offset(offset);
    }

    const hasMore = packages.length > limit;
    const page = hasMore ? packages.slice(0, limit) : packages;
    const nextToken = hasMore ? String(offset + limit) : undefined;

    const data = await Promise.all(
      page.map(async (pkg) => {
        const versions = await resolveVersions(pkg);
        return {
          PackageIdentifier: buildPackageIdentifier(pkg),
          Versions: versions.map(buildVersionEntry),
        };
      }),
    );

    res.json({
      Data: data,
      ...(nextToken ? { ContinuationToken: nextToken } : {}),
    });
  } catch (err) {
    req.log.error({ err }, "Error listing winget packages");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /winget/packages/:packageIdentifier
 * Returns details for a specific package.
 */
router.get("/packages/:packageIdentifier", async (req, res): Promise<void> => {
  try {
    const { packageIdentifier } = req.params;
    const [pkg] = await db
      .select()
      .from(packagesTable)
      .where(eq(packagesTable.packageId, packageIdentifier));

    if (!pkg) {
      res.status(404).json({ error: "Package not found" });
      return;
    }

    const versions = await resolveVersions(pkg);

    res.json({
      Data: {
        PackageIdentifier: buildPackageIdentifier(pkg),
        Publisher: pkg.publisher,
        PackageName: pkg.name,
        Description: pkg.description ?? null,
        Homepage: pkg.homepage ?? null,
        License: pkg.license ?? null,
        Versions: versions.map(buildVersionEntry),
      },
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching winget package");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /winget/packages/:packageIdentifier/versions
 * Returns the list of available versions for a package.
 */
router.get("/packages/:packageIdentifier/versions", async (req, res): Promise<void> => {
  try {
    const { packageIdentifier } = req.params;
    const [pkg] = await db
      .select()
      .from(packagesTable)
      .where(eq(packagesTable.packageId, packageIdentifier));

    if (!pkg) {
      res.status(404).json({ error: "Package not found" });
      return;
    }

    const versions = await resolveVersions(pkg);

    res.json({
      Data: versions.map(buildVersionEntry),
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching winget package versions");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /winget/packages/:packageIdentifier/versions/:version
 * Returns detail for a specific version of a package.
 */
router.get("/packages/:packageIdentifier/versions/:version", async (req, res): Promise<void> => {
  try {
    const { packageIdentifier, version } = req.params;
    const [pkg] = await db
      .select()
      .from(packagesTable)
      .where(eq(packagesTable.packageId, packageIdentifier));

    if (!pkg) {
      res.status(404).json({ error: "Package not found" });
      return;
    }

    const resolved = await resolveVersion(pkg, version);
    if (!resolved.found) {
      res.status(404).json({ error: "Version not found" });
      return;
    }

    res.json({ Data: buildVersionEntry(resolved.version) });
  } catch (err) {
    req.log.error({ err }, "Error fetching winget package version");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /winget/packages/:packageIdentifier/versions/:version/manifests
 * Returns the manifest for a specific version of a package.
 *
 * The response embeds YAML-serialized manifest strings inside a JSON envelope,
 * matching the Winget REST source contract format. Each manifest sub-type
 * (version, defaultLocale, installer) is serialized to YAML independently.
 *
 * For `winget install` to work end-to-end, the package must have a valid
 * InstallerUrl and InstallerSha256 (either on the package row or in the
 * package_versions table for the requested version).
 */
router.get("/packages/:packageIdentifier/versions/:version/manifests", async (req, res): Promise<void> => {
  try {
    const { packageIdentifier, version } = req.params;
    const [pkg] = await db
      .select()
      .from(packagesTable)
      .where(eq(packagesTable.packageId, packageIdentifier));

    if (!pkg) {
      res.status(404).json({ error: "Package not found" });
      return;
    }

    const resolved = await resolveVersion(pkg, version);
    if (!resolved.found) {
      res.status(404).json({ error: "Version not found" });
      return;
    }

    const versionManifest = buildVersionManifest(pkg, resolved.version);
    const defaultLocaleManifest = buildDefaultLocaleManifest(pkg, resolved.version);
    const installerManifest = resolved.versionRow
      ? buildInstallerManifestFromVersion(pkg, resolved.versionRow)
      : buildInstallerManifest(pkg);

    res.json({
      Data: {
        VersionManifest: yaml.dump(versionManifest, { lineWidth: -1 }),
        DefaultLocaleManifest: yaml.dump(defaultLocaleManifest, { lineWidth: -1 }),
        LocaleManifests: [],
        InstallerManifest: yaml.dump(installerManifest, { lineWidth: -1 }),
      },
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching winget package manifests");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
