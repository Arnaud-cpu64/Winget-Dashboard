import React, { useState, useMemo } from "react";
import { useListPackages } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Cpu,
  Search,
  Copy,
  Check,
  Download,
  FileCode,
  FileJson,
  FileText,
  Shield,
  Zap,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function getApiUrl(path: string): string {
  return `${BASE}${path}`;
}

function generateDetectionScript(
  packageId: string,
  version: string,
  repoName: string,
): string {
  const versionLine =
    version === "latest"
      ? `# Version cible : dernière version disponible dans le dépôt`
      : `$TargetVersion = "${version}"`;

  const versionCheck =
    version === "latest"
      ? `    if ($output -match [regex]::Escape($PackageId)) {\n        exit 0\n    } else {\n        exit 1\n    }`
      : `    if ($output -match [regex]::Escape($PackageId)) {\n        if ($output -match [regex]::Escape($TargetVersion)) {\n            exit 0\n        }\n    }\n    exit 1`;

  return `# Script de détection SCCM/MECM — ${packageId}
# Généré par WG-REPO Dashboard
# Retourne 0 (trouvé) ou 1 (non trouvé/version incorrecte)

${versionLine}
$PackageId = "${packageId}"
$RepoName  = "${repoName}"

try {
    $output = winget list --id $PackageId --source $RepoName --accept-source-agreements 2>$null
    if ($LASTEXITCODE -ne 0) { exit 1 }

${versionCheck}
} catch {
    exit 1
}
`;
}

function generateInstallScript(
  packageId: string,
  version: string,
  repoName: string,
): string {
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
      return `    # ${p.name}\n    winget install --id "${p.packageId}"${versionArg} --source $RepoName --silent --accept-package-agreements --accept-source-agreements\n    if ($LASTEXITCODE -ne 0) { Write-Warning "Échec : ${p.packageId}" }`;
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

function CopyButton({ text, label = "Copier" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="font-mono text-xs gap-1.5 border-border"
      onClick={handleCopy}
    >
      {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
      {copied ? "Copié !" : label}
    </Button>
  );
}

function downloadText(content: string, filename: string, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SccmPage() {
  const { toast } = useToast();
  const { data: packages, isLoading } = useListPackages();

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [repoName, setRepoName] = useState("MonRepo");
  const [activePackageId, setActivePackageId] = useState<number | null>(null);

  const filtered = useMemo(
    () =>
      packages?.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.packageId.toLowerCase().includes(search.toLowerCase()) ||
          p.publisher.toLowerCase().includes(search.toLowerCase()),
      ) ?? [],
    [packages, search],
  );

  const selectedPackages = useMemo(
    () => packages?.filter((p) => selected.has(p.id)) ?? [],
    [packages, selected],
  );

  const activePackage = useMemo(
    () => packages?.find((p) => p.id === activePackageId) ?? null,
    [packages, activePackageId],
  );

  const toggleAll = () => {
    if (selected.size === filtered.length && filtered.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((p) => p.id)));
    }
  };

  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        if (activePackageId === id) setActivePackageId(null);
      } else {
        next.add(id);
        setActivePackageId(id);
      }
      return next;
    });
  };

  const handleExportJson = async () => {
    try {
      const url = getApiUrl(`/api/packages/export?format=json`);
      const res = await fetch(url);
      const data = await res.json();
      downloadText(JSON.stringify(data, null, 2), "winget-packages.json", "application/json");
      toast({ title: "Export JSON", description: "Fichier téléchargé." });
    } catch {
      toast({ variant: "destructive", title: "Erreur", description: "Export JSON échoué." });
    }
  };

  const handleExportCsv = async () => {
    try {
      const url = getApiUrl(`/api/packages/export?format=csv`);
      const res = await fetch(url);
      const text = await res.text();
      downloadText(text, "winget-packages.csv", "text/csv");
      toast({ title: "Export CSV", description: "Fichier téléchargé." });
    } catch {
      toast({ variant: "destructive", title: "Erreur", description: "Export CSV échoué." });
    }
  };

  const handleExportPs1 = () => {
    if (selectedPackages.length === 0) {
      toast({
        variant: "destructive",
        title: "Aucun package sélectionné",
        description: "Cochez au moins un package pour générer le script groupé.",
      });
      return;
    }
    const script = generateBulkScript(selectedPackages, repoName);
    downloadText(script, `install-${repoName}.ps1`, "text/plain");
    toast({ title: "Script PowerShell exporté", description: `${selectedPackages.length} package(s) inclus.` });
  };

  const detectionScript = activePackage
    ? generateDetectionScript(activePackage.packageId, activePackage.version, repoName)
    : null;

  const installScript = activePackage
    ? generateInstallScript(activePackage.packageId, activePackage.version, repoName)
    : null;

  const bulkScript =
    selectedPackages.length > 0 ? generateBulkScript(selectedPackages, repoName) : null;

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((p) => selected.has(p.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-mono font-bold tracking-tight text-foreground flex items-center gap-3">
          <Cpu size={28} className="text-primary" />
          Intégration SCCM / MECM
        </h1>
        <p className="text-muted-foreground mt-2 font-mono text-sm">
          Générez des scripts PowerShell de détection et d'installation, ou exportez votre catalogue
          de packages.
        </p>
      </div>

      {/* Repo name config + Export buttons */}
      <Card className="bg-card/50 backdrop-blur border-border shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="font-mono text-base flex items-center gap-2">
            <Zap size={15} className="text-primary" />
            Configuration du dépôt
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <div className="flex flex-col gap-1 flex-1 max-w-sm">
              <label className="text-xs font-mono text-muted-foreground">
                Nom du dépôt winget (--source)
              </label>
              <Input
                value={repoName}
                onChange={(e) => setRepoName(e.target.value)}
                placeholder="MonRepo"
                className="font-mono bg-background/50 border-border focus-visible:ring-primary h-9"
              />
            </div>

            <div className="flex flex-wrap gap-2 sm:ml-auto">
              <Button
                variant="outline"
                size="sm"
                className="font-mono text-xs gap-1.5 border-border"
                onClick={handleExportJson}
              >
                <FileJson size={13} />
                Export JSON
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="font-mono text-xs gap-1.5 border-border"
                onClick={handleExportCsv}
              >
                <FileText size={13} />
                Export CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="font-mono text-xs gap-1.5 border-border"
                onClick={handleExportPs1}
                disabled={selectedPackages.length === 0}
              >
                <Download size={13} />
                Script groupé .ps1
                {selectedPackages.length > 0 && (
                  <span className="ml-1 bg-primary/20 text-primary rounded px-1 text-[10px]">
                    {selectedPackages.length}
                  </span>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Package selector */}
        <Card className="bg-card/50 backdrop-blur border-border shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="font-mono text-base flex items-center gap-2">
              <Shield size={15} className="text-primary" />
              Sélection des packages
            </CardTitle>
            <div className="relative mt-2">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Filtrer..."
                className="pl-9 font-mono bg-background/50 border-border focus-visible:ring-primary h-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="border-y border-border">
              <Table>
                <TableHeader className="bg-secondary/50">
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="w-10 pl-4">
                      <Checkbox
                        checked={allFilteredSelected}
                        onCheckedChange={toggleAll}
                        disabled={isLoading || filtered.length === 0}
                        aria-label="Tout sélectionner"
                      />
                    </TableHead>
                    <TableHead className="font-mono">Package</TableHead>
                    <TableHead className="font-mono w-24">Version</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i} className="border-border">
                        <TableCell className="pl-4">
                          <Skeleton className="h-4 w-4" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-8 w-full" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-5 w-16" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="h-24 text-center text-muted-foreground font-mono text-sm">
                        Aucun package trouvé.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((pkg) => {
                      const isSelected = selected.has(pkg.id);
                      const isActive = activePackageId === pkg.id;
                      return (
                        <TableRow
                          key={pkg.id}
                          className={`border-border transition-colors cursor-pointer ${
                            isActive
                              ? "bg-primary/10"
                              : isSelected
                                ? "bg-secondary/30"
                                : "hover:bg-secondary/20"
                          }`}
                          onClick={() => toggleOne(pkg.id)}
                        >
                          <TableCell className="pl-4" onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleOne(pkg.id)}
                              aria-label={`Sélectionner ${pkg.name}`}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-foreground text-sm">{pkg.name}</div>
                            <div className="text-xs text-muted-foreground font-mono">{pkg.packageId}</div>
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center rounded border border-border px-2 py-0.5 text-xs font-semibold font-mono bg-secondary/50">
                              {pkg.version}
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="px-4 py-2 text-xs font-mono text-muted-foreground">
              {selected.size > 0
                ? `${selected.size} package(s) sélectionné(s)`
                : "Cliquez sur un package pour voir son script"}
            </div>
          </CardContent>
        </Card>

        {/* Script viewer */}
        <Card className="bg-card/50 backdrop-blur border-border shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="font-mono text-base flex items-center gap-2">
              <FileCode size={15} className="text-primary" />
              Scripts PowerShell générés
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!activePackage && selected.size === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center text-muted-foreground font-mono text-sm p-6">
                <FileCode size={36} className="mb-3 opacity-20" />
                <p>Sélectionnez un ou plusieurs packages</p>
                <p className="text-xs opacity-60 mt-1">
                  Le script de détection et d'installation s'affichera ici.
                </p>
              </div>
            ) : (
              <Tabs defaultValue="detection" className="w-full">
                <div className="px-4 pt-2">
                  <TabsList className="bg-secondary/50 border border-border w-full">
                    <TabsTrigger value="detection" className="font-mono text-xs flex-1">
                      Détection
                    </TabsTrigger>
                    <TabsTrigger value="installation" className="font-mono text-xs flex-1">
                      Installation
                    </TabsTrigger>
                    {selectedPackages.length > 1 && (
                      <TabsTrigger value="bulk" className="font-mono text-xs flex-1">
                        Groupé ({selectedPackages.length})
                      </TabsTrigger>
                    )}
                  </TabsList>
                </div>

                <TabsContent value="detection" className="mt-0 p-4 space-y-3">
                  {activePackage ? (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono text-muted-foreground">
                          {activePackage.name}
                        </span>
                        <CopyButton text={detectionScript!} label="Copier le script" />
                      </div>
                      <pre className="text-xs font-mono bg-background/80 border border-border rounded-md p-3 overflow-x-auto whitespace-pre max-h-80 overflow-y-auto text-foreground/90 leading-5">
                        {detectionScript}
                      </pre>
                    </>
                  ) : (
                    <p className="text-sm font-mono text-muted-foreground py-6 text-center">
                      Sélectionnez un package pour afficher son script de détection.
                    </p>
                  )}
                </TabsContent>

                <TabsContent value="installation" className="mt-0 p-4 space-y-3">
                  {activePackage ? (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono text-muted-foreground">
                          {activePackage.name}
                        </span>
                        <CopyButton text={installScript!} label="Copier le script" />
                      </div>
                      <pre className="text-xs font-mono bg-background/80 border border-border rounded-md p-3 overflow-x-auto whitespace-pre max-h-80 overflow-y-auto text-foreground/90 leading-5">
                        {installScript}
                      </pre>
                    </>
                  ) : (
                    <p className="text-sm font-mono text-muted-foreground py-6 text-center">
                      Sélectionnez un package pour afficher son script d'installation.
                    </p>
                  )}
                </TabsContent>

                {selectedPackages.length > 1 && (
                  <TabsContent value="bulk" className="mt-0 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-muted-foreground">
                        {selectedPackages.length} packages — dépôt : {repoName}
                      </span>
                      <div className="flex gap-2">
                        <CopyButton text={bulkScript!} label="Copier" />
                        <Button
                          variant="outline"
                          size="sm"
                          className="font-mono text-xs gap-1.5 border-border"
                          onClick={handleExportPs1}
                        >
                          <Download size={12} />
                          .ps1
                        </Button>
                      </div>
                    </div>
                    <pre className="text-xs font-mono bg-background/80 border border-border rounded-md p-3 overflow-x-auto whitespace-pre max-h-80 overflow-y-auto text-foreground/90 leading-5">
                      {bulkScript}
                    </pre>
                  </TabsContent>
                )}
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Usage instructions */}
      <Card className="bg-card/50 backdrop-blur border-border shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="font-mono text-base flex items-center gap-2">
            <FileCode size={15} className="text-primary" />
            Guide d'utilisation dans SCCM / MECM
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm font-mono text-muted-foreground">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <div className="text-foreground font-semibold text-xs uppercase tracking-widest mb-2">
                1. Script de détection
              </div>
              <p>Dans la console SCCM, créez une application et ajoutez un <span className="text-foreground">type de déploiement</span>.</p>
              <p>Dans l'onglet <span className="text-foreground">Méthode de détection</span>, choisissez <span className="text-foreground">Script personnalisé</span> et collez le script généré.</p>
            </div>
            <div className="space-y-1.5">
              <div className="text-foreground font-semibold text-xs uppercase tracking-widest mb-2">
                2. Script d'installation
              </div>
              <p>Dans l'onglet <span className="text-foreground">Programmes</span>, configurez le programme d'installation avec :</p>
              <pre className="bg-background/80 border border-border rounded p-2 text-xs text-foreground/90 whitespace-pre-wrap">{`powershell.exe -ExecutionPolicy Bypass -File install.ps1`}</pre>
            </div>
            <div className="space-y-1.5">
              <div className="text-foreground font-semibold text-xs uppercase tracking-widest mb-2">
                3. Export & inventaire
              </div>
              <p>Utilisez l'<span className="text-foreground">Export CSV/JSON</span> pour alimenter des scripts d'inventaire ou comparer l'état de vos postes avec le catalogue du dépôt.</p>
              <p>L'export PowerShell groupé peut être utilisé dans une <span className="text-foreground">séquence de tâches OSD</span>.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
