import { Router, type IRouter } from "express";
import { eq, count, countDistinct, gte, sql } from "drizzle-orm";
import { db, packagesTable, packageVersionsTable } from "@workspace/db";
import {
  AddPackageBody,
  GetPackageParams,
  RemovePackageParams,
  UpdatePackageVersionBody,
  GetPackageResponse,
  GetPackageStatsResponse,
  ListPackagesResponse,
} from "@workspace/api-zod";
import { getPackageVersion } from "./winget.js";

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

  const [pkg] = await db
    .insert(packagesTable)
    .values({ ...parsed.data, version: resolvedVersion })
    .returning();

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

  const body = UpdatePackageVersionBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [pkg] = await db
    .update(packagesTable)
    .set({ version: body.data.version })
    .where(eq(packagesTable.id, params.data.id))
    .returning();

  if (!pkg) {
    res.status(404).json({ error: "Package not found" });
    return;
  }

  res.json(GetPackageResponse.parse(pkg));
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
