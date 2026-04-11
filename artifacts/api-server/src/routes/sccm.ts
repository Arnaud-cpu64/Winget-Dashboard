import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db, packagesTable } from "@workspace/db";

const router: IRouter = Router();

function generateDetectionScript(packageId: string, version: string, repoName: string): string {
  const versionLine =
    version === "latest"
      ? `# Version cible : dernière version disponible dans le dépôt`
      : `$TargetVersion = "${version}"`;

  return `# Script de détection SCCM/MECM — ${packageId}
# Généré par WG-REPO Dashboard
# Retourne 0 (trouvé) ou 1 (non trouvé/version incorrecte)

${versionLine}
$PackageId = "${packageId}"
$RepoName  = "${repoName}"

try {
    $output = winget list --id $PackageId --source $RepoName --accept-source-agreements 2>$null
    if ($LASTEXITCODE -ne 0) { exit 1 }

${
  version === "latest"
    ? `    if ($output -match [regex]::Escape($PackageId)) {
        exit 0
    } else {
        exit 1
    }`
    : `    if ($output -match [regex]::Escape($PackageId)) {
        if ($output -match [regex]::Escape($TargetVersion)) {
            exit 0
        }
    }
    exit 1`
}
} catch {
    exit 1
}
`;
}

function generateInstallScript(packageId: string, version: string, repoName: string): string {
  const versionArg = version === "latest" ? "" : ` --version "${version}"`;

  return `# Script d'installation SCCM/MECM — ${packageId}
# Généré par WG-REPO Dashboard
# À coller dans une étape "Exécuter un script PowerShell" de SCCM

$PackageId = "${packageId}"
$RepoName  = "${repoName}"

try {
    $result = winget install --id $PackageId${versionArg} --source $RepoName --silent --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -eq 0) {
        Write-Output "Installation réussie : $PackageId"
        exit 0
    } else {
        Write-Error "Échec de l'installation (code $LASTEXITCODE)"
        exit 1
    }
} catch {
    Write-Error "Exception : $_"
    exit 1
}
`;
}

function generateBulkScript(
  packages: Array<{ packageId: string; name: string; version: string }>,
  repoName: string,
): string {
  const installs = packages
    .map((p) => {
      const versionArg = p.version === "latest" ? "" : ` --version "${p.version}"`;
      return `    # ${p.name}
    winget install --id "${p.packageId}"${versionArg} --source $RepoName --silent --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) { Write-Warning "Échec : ${p.packageId}" }`;
    })
    .join("\n\n");

  return `# Script d'installation groupée SCCM/MECM
# Généré par WG-REPO Dashboard — ${new Date().toISOString().slice(0, 10)}
# Packages : ${packages.length}

$RepoName = "${repoName}"

${installs}

Write-Output "Déploiement terminé."
`;
}

router.get("/packages/export", async (req, res): Promise<void> => {
  const format = typeof req.query.format === "string" ? req.query.format : "json";
  const repoName = typeof req.query.repo === "string" ? req.query.repo : "MonRepo";

  const packages = await db
    .select()
    .from(packagesTable)
    .orderBy(sql`${packagesTable.addedAt} desc`);

  if (format === "csv") {
    const header = "PackageId,Name,Publisher,Version,License,Homepage,AddedAt";
    const rows = packages.map((p) => {
      const escape = (v: string | null | undefined) =>
        v == null ? "" : `"${v.replace(/"/g, '""')}"`;
      return [
        escape(p.packageId),
        escape(p.name),
        escape(p.publisher),
        escape(p.version),
        escape(p.license),
        escape(p.homepage),
        escape(new Date(p.addedAt).toISOString()),
      ].join(",");
    });
    const csv = [header, ...rows].join("\r\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=winget-packages.csv");
    res.send(csv);
    return;
  }

  if (format === "powershell") {
    const script = generateBulkScript(packages, repoName);
    res.setHeader("Content-Type", "text/plain");
    res.setHeader("Content-Disposition", "attachment; filename=install-all-packages.ps1");
    res.send(script);
    return;
  }

  res.json(
    packages.map((p) => ({
      packageId: p.packageId,
      name: p.name,
      publisher: p.publisher,
      version: p.version,
      license: p.license ?? null,
      homepage: p.homepage ?? null,
      addedAt: new Date(p.addedAt).toISOString(),
    })),
  );
});

router.get("/packages/sccm-scripts", async (req, res): Promise<void> => {
  const repoName = typeof req.query.repo === "string" ? req.query.repo : "MonRepo";

  const rawIds = req.query.ids;
  let ids: number[] = [];

  if (typeof rawIds === "string") {
    ids = rawIds
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n));
  }

  if (ids.length === 0) {
    res.status(400).json({ error: "Aucun identifiant de package fourni (paramètre ids)" });
    return;
  }

  const packages = await db.select().from(packagesTable);
  const selected = packages.filter((p) => ids.includes(p.id));

  if (selected.length === 0) {
    res.status(404).json({ error: "Aucun package trouvé pour les identifiants fournis" });
    return;
  }

  const scripts = selected.map((p) => ({
    packageId: p.packageId,
    name: p.name,
    version: p.version,
    detection: generateDetectionScript(p.packageId, p.version, repoName),
    installation: generateInstallScript(p.packageId, p.version, repoName),
  }));

  res.json({ repo: repoName, scripts });
});

export default router;
