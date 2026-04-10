import { Router, type IRouter } from "express";
import { db, packagesTable } from "@workspace/db";
import { CheckPackageUpdatesResponse } from "@workspace/api-zod";

const router: IRouter = Router();

const GITHUB_API = "https://api.github.com";
const REPO = "microsoft/winget-pkgs";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface VersionEntry {
  version: string | null;
}

const versionCache = new Map<string, VersionEntry>();
let lastCheckedAt: Date = new Date(0);
let refreshInProgress = false;

interface GitHubContent {
  name: string;
  type: "file" | "dir";
}

async function fetchGitHubContents(path: string): Promise<GitHubContent[]> {
  const url = `${GITHUB_API}/repos/${REPO}/contents/${path}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "winget-repo-dashboard/1.0",
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? (data as GitHubContent[]) : [];
}

function parsePackageId(packageId: string): { letter: string; publisher: string; packageName: string } | null {
  const dotIndex = packageId.indexOf(".");
  if (dotIndex === -1) return null;
  const publisher = packageId.slice(0, dotIndex);
  const packageName = packageId.slice(dotIndex + 1);
  const firstChar = publisher[0]?.toLowerCase();
  if (!firstChar) return null;
  return { letter: firstChar, publisher, packageName };
}

function compareVersions(a: string, b: string): number {
  const clean = (v: string) => v.split(/[-+]/)[0];
  const aParts = clean(a).split(".").map((n) => parseInt(n, 10) || 0);
  const bParts = clean(b).split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const diff = (aParts[i] ?? 0) - (bParts[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

async function fetchLatestVersion(packageId: string): Promise<string | null> {
  const parsed = parsePackageId(packageId);
  if (!parsed) return null;

  const { letter, publisher, packageName } = parsed;
  const path = `manifests/${letter}/${publisher}/${packageName}`;
  const contents = await fetchGitHubContents(path);
  const versions = contents.filter((c) => c.type === "dir").map((c) => c.name);

  if (versions.length === 0) return null;

  versions.sort((a, b) => compareVersions(b, a));
  return versions[0] ?? null;
}

async function refreshAll(): Promise<void> {
  if (refreshInProgress) return;
  refreshInProgress = true;

  try {
    const packages = await db.select({ packageId: packagesTable.packageId }).from(packagesTable);

    for (const pkg of packages) {
      try {
        const version = await fetchLatestVersion(pkg.packageId);
        versionCache.set(pkg.packageId, { version });
        await new Promise((r) => setTimeout(r, 300));
      } catch {
        versionCache.set(pkg.packageId, { version: null });
      }
    }

    lastCheckedAt = new Date();
  } finally {
    refreshInProgress = false;
  }
}

export function startUpdateScheduler(): void {
  refreshAll().catch(() => {});
  setInterval(() => refreshAll().catch(() => {}), CACHE_TTL_MS);
}

router.get("/packages/check-updates", async (_req, res): Promise<void> => {
  const updates: Record<string, string | null> = {};
  for (const [packageId, entry] of versionCache.entries()) {
    updates[packageId] = entry.version;
  }

  res.json(
    CheckPackageUpdatesResponse.parse({
      lastCheckedAt,
      updates,
    }),
  );
});

export default router;
