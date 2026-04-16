import { Router, type IRouter } from "express";
import { eq, ilike, or, and } from "drizzle-orm";
import yaml from "js-yaml";
import { db, packagesTable, packageVersionsTable } from "@workspace/db";
import type { Package, PackageVersion } from "@workspace/db";

const router: IRouter = Router();

const API_VERSION = "1.7.0";

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
 * Required by winget client during source initialization.
 * https://github.com/microsoft/winget-cli-restsource
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
  });
});

/**
 * POST /winget/manifestSearch
 * Winget REST source contract — search endpoint.
 * Called by `winget search`, `winget install`, `winget upgrade`.
 */
router.post("/manifestSearch", async (req, res): Promise<void> => {
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
      } else if (field === "Keyword" || field === "Tag" || field === "Command" || field === "Moniker") {
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
    req.log.error({ err }, "Error searching winget packages");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /winget/packageManifests/:packageIdentifier
 * Returns all versions + manifests for a specific package.
 * Called by `winget install` and `winget show`.
 */
router.get("/packageManifests/:packageIdentifier", async (req, res): Promise<void> => {
  try {
    const { packageIdentifier } = req.params;
    const [pkg] = await db
      .select()
      .from(packagesTable)
      .where(eq(packagesTable.packageId, packageIdentifier));

    if (!pkg) {
      res.status(404).json({ Data: null });
      return;
    }

    const versions = await resolveVersions(pkg);

    const versionData = await Promise.all(
      versions.map(async (version) => {
        const resolved = await resolveVersion(pkg, version);
        if (!resolved.found) return null;

        const versionManifest = buildVersionManifest(pkg, version);
        const defaultLocaleManifest = buildDefaultLocaleManifest(pkg, version);
        const installerManifest = resolved.versionRow
          ? buildInstallerManifestFromVersion(pkg, resolved.versionRow)
          : buildInstallerManifest(pkg);

        return {
          PackageVersion: version,
          DefaultLocale: buildDefaultLocaleShort(pkg),
          Channel: null,
          Manifests: {
            VersionManifest: yaml.dump(versionManifest, { lineWidth: -1 }),
            DefaultLocaleManifest: yaml.dump(defaultLocaleManifest, { lineWidth: -1 }),
            LocaleManifests: [],
            InstallerManifest: yaml.dump(installerManifest, { lineWidth: -1 }),
          },
        };
      }),
    );

    res.json({
      Data: {
        PackageIdentifier: buildPackageIdentifier(pkg),
        Versions: versionData.filter(Boolean),
      },
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching winget package manifests");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /winget/packageManifests/:packageIdentifier/:packageVersionId
 * Returns manifests for a specific version of a package.
 */
router.get("/packageManifests/:packageIdentifier/:packageVersionId", async (req, res): Promise<void> => {
  try {
    const { packageIdentifier, packageVersionId } = req.params;
    const [pkg] = await db
      .select()
      .from(packagesTable)
      .where(eq(packagesTable.packageId, packageIdentifier));

    if (!pkg) {
      res.status(404).json({ Data: null });
      return;
    }

    const resolved = await resolveVersion(pkg, packageVersionId);
    if (!resolved.found) {
      res.status(404).json({ Data: null });
      return;
    }

    const versionManifest = buildVersionManifest(pkg, resolved.version);
    const defaultLocaleManifest = buildDefaultLocaleManifest(pkg, resolved.version);
    const installerManifest = resolved.versionRow
      ? buildInstallerManifestFromVersion(pkg, resolved.versionRow)
      : buildInstallerManifest(pkg);

    res.json({
      Data: {
        PackageIdentifier: buildPackageIdentifier(pkg),
        Versions: [
          {
            PackageVersion: resolved.version,
            DefaultLocale: buildDefaultLocaleShort(pkg),
            Channel: null,
            Manifests: {
              VersionManifest: yaml.dump(versionManifest, { lineWidth: -1 }),
              DefaultLocaleManifest: yaml.dump(defaultLocaleManifest, { lineWidth: -1 }),
              LocaleManifests: [],
              InstallerManifest: yaml.dump(installerManifest, { lineWidth: -1 }),
            },
          },
        ],
      },
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching winget package version manifests");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
