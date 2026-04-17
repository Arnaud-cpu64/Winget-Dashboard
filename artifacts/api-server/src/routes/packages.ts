import { Router, type IRouter } from "express";
import { eq, count, countDistinct, gte, sql } from "drizzle-orm";
import { db, packagesTable, packageVersionsTable } from "@workspace/db";
import {
  AddPackageBody,
  GetPackageParams,
  RemovePackageParams,
  UpdatePackageVersionBody,
  UpdatePackageBody,
  UpdateVersionBody,
  UpdateVersionParams,
  GetPackageResponse,
  GetPackageStatsResponse,
  ListPackagesResponse,
} from "@workspace/api-zod";
import { getPackageVersion, fetchInstallerManifest } from "./winget.js";

const router: IRouter = Router();

router.get("/packages/stats", async (_req, res): Promise<void> => {
  const [totalsResult] = await db
    .select({
      total: count(),
      publishers: countDistinct(packagesTable.publisher),
    })
    .from(packagesTable);

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [recentResult] = await db
    .select({ recentlyAdded: count() })
    .from(packagesTable)
    .where(gte(packagesTable.addedAt, sevenDaysAgo));

  const stats = GetPackageStatsResponse.parse({
    total: totalsResult?.total ?? 0,
    publishers: totalsResult?.publishers ?? 0,
    recentlyAdded: recentResult?.recentlyAdded ?? 0,
  });

  res.json(stats);
});

router.get("/packages", async (_req, res): Promise<void> => {
  const packages = await db
    .select()
    .from(packagesTable)
    .orderBy(sql`${packagesTable.addedAt} desc`);
  res.json(ListPackagesResponse.parse(packages));
});

router.post("/packages", async (req, res): Promise<void> => {
  const parsed = AddPackageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existing = await db
    .select()
    .from(packagesTable)
    .where(eq(packagesTable.packageId, parsed.data.packageId));

  if (existing.length > 0) {
    res.status(409).json({ error: "Package already exists in local repo" });
    return;
  }

  // Si la version est "latest", on résout la vraie version depuis le dépôt winget
  let resolvedVersion = parsed.data.version;
  if (resolvedVersion === "latest") {
    try {
      const real = await Promise.race([
        getPackageVersion(parsed.data.packageId),
        new Promise<string>((resolve) => setTimeout(() => resolve("latest"), 8000)),
      ]);
      resolvedVersion = real;
    } catch {
      resolvedVersion = "latest";
    }
  }

  // Strip version-specific installer fields from the packages table insert
  const {
    installerType: _it, architecture: _ar, scope: _sc, upgradeCode: _uc,
    silentSwitch: _ss, silentWithProgressSwitch: _sp, upgradeBehavior: _ub,
    ...pkgFields
  } = parsed.data as any;

  const [pkg] = await db
    .insert(packagesTable)
    .values({ ...pkgFields, version: resolvedVersion })
    .returning();

  // Auto-fetch installer details from the winget-pkgs GitHub manifest
  let installers = await (async () => {
    try {
      return await Promise.race([
        fetchInstallerManifest(pkg.packageId, resolvedVersion),
        new Promise<[]>((resolve) => setTimeout(() => resolve([]), 12000)),
      ]);
    } catch {
      return [];
    }
  })();

  if (installers.length > 0) {
    // Insert one package_versions row per installer entry (one per architecture)
    await db.insert(packageVersionsTable).values(
      installers.map((ins) => ({
        packageId: pkg.id,
        version: resolvedVersion,
        installerUrl: ins.installerUrl,
        installerSha256: ins.installerSha256 || null,
        installerType: ins.installerType,
        architecture: ins.architecture,
        scope: ins.scope,
        productCode: ins.productCode,
        upgradeCode: ins.upgradeCode,
        packageFamilyName: ins.packageFamilyName,
        silentSwitch: ins.silentSwitch,
        silentWithProgressSwitch: ins.silentWithProgressSwitch,
        installLocationSwitch: ins.installLocationSwitch,
        installModes: ins.installModes,
        upgradeBehavior: ins.upgradeBehavior,
        minimumOsVersion: ins.minimumOsVersion,
        installerLocale: ins.installerLocale,
        releaseDate: ins.releaseDate,
        elevationRequirement: ins.elevationRequirement,
      })),
    ).onConflictDoNothing();
  } else {
    // Fallback: insert a single entry with whatever was passed in the body
    await db.insert(packageVersionsTable).values({
      packageId: pkg.id,
      version: resolvedVersion,
      installerUrl: pkgFields.installerUrl ?? null,
      installerSha256: pkgFields.installerSha256 ?? null,
      installerType: (_it as string | null) ?? null,
      architecture: (_ar as string | null) ?? null,
      scope: (_sc as string | null) ?? null,
      productCode: pkgFields.productCode ?? null,
      upgradeCode: (_uc as string | null) ?? null,
      silentSwitch: (_ss as string | null) ?? null,
      silentWithProgressSwitch: (_sp as string | null) ?? null,
      upgradeBehavior: (_ub as string | null) ?? null,
    }).onConflictDoNothing();
  }

  res.status(201).json(GetPackageResponse.parse(pkg));
});

router.get("/packages/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetPackageParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [pkg] = await db
    .select()
    .from(packagesTable)
    .where(eq(packagesTable.id, params.data.id));

  if (!pkg) {
    res.status(404).json({ error: "Package not found" });
    return;
  }

  res.json(GetPackageResponse.parse(pkg));
});

router.patch("/packages/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetPackageParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Accept either the new full-body schema or the legacy { version } body
  const full = UpdatePackageBody.safeParse(req.body);
  const legacy = UpdatePackageVersionBody.safeParse(req.body);
  if (!full.success && !legacy.success) {
    res.status(400).json({ error: full.error?.message ?? "Invalid body" });
    return;
  }

  const updates = full.success ? full.data : { version: legacy.data!.version };

  // Strip null/undefined so we only SET fields that were provided
  const setFields = Object.fromEntries(
    Object.entries(updates).filter(([, v]) => v !== undefined && v !== null),
  );

  if (Object.keys(setFields).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const [pkg] = await db
    .update(packagesTable)
    .set(setFields)
    .where(eq(packagesTable.id, params.data.id))
    .returning();

  if (!pkg) {
    res.status(404).json({ error: "Package not found" });
    return;
  }

  res.json(GetPackageResponse.parse(pkg));
});

router.patch("/packages/:id/versions/:versionId", async (req, res): Promise<void> => {
  const idRaw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const vidRaw = Array.isArray(req.params.versionId) ? req.params.versionId[0] : req.params.versionId;
  const params = UpdateVersionParams.safeParse({
    id: parseInt(idRaw, 10),
    versionId: parseInt(vidRaw, 10),
  });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = UpdateVersionBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const setFields = Object.fromEntries(
    Object.entries(body.data).filter(([, v]) => v !== undefined && v !== null),
  );

  if (Object.keys(setFields).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const [ver] = await db
    .update(packageVersionsTable)
    .set(setFields)
    .where(
      eq(packageVersionsTable.id, params.data.versionId),
    )
    .returning();

  if (!ver) {
    res.status(404).json({ error: "Version not found" });
    return;
  }

  res.json(ver);
});

router.get("/packages/:id/versions", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetPackageParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [pkg] = await db
    .select()
    .from(packagesTable)
    .where(eq(packagesTable.id, params.data.id));

  if (!pkg) {
    res.status(404).json({ error: "Package not found" });
    return;
  }

  const versions = await db
    .select()
    .from(packageVersionsTable)
    .where(eq(packageVersionsTable.packageId, params.data.id))
    .orderBy(sql`${packageVersionsTable.addedAt} desc`);

  res.json(versions);
});

router.delete("/packages/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = RemovePackageParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [pkg] = await db
    .delete(packagesTable)
    .where(eq(packagesTable.id, params.data.id))
    .returning();

  if (!pkg) {
    res.status(404).json({ error: "Package not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
