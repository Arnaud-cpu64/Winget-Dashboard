import React, { useState, useEffect } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ExternalLink,
  Package,
  Calendar,
  Tag,
  Building2,
  FileText,
  Scale,
  Link2,
  Hash,
  ShieldCheck,
  KeyRound,
  ArrowUpCircle,
  Terminal,
  Layers,
  Wrench,
  RefreshCw,
  MonitorDown,
  Pencil,
  Save,
  X,
} from "lucide-react";
import type { ListPackagesResponseItem } from "@workspace/api-zod";
import { z } from "zod/v4";

type LocalPackage = z.infer<typeof ListPackagesResponseItem>;

interface PackageVersion {
  id: number;
  packageId: number;
  version: string;
  installerUrl: string | null;
  installerSha256: string | null;
  installerType: string | null;
  installerLocale: string | null;
  architecture: string | null;
  platform: string | null;
  minimumOsVersion: string | null;
  packageFamilyName: string | null;
  productCode: string | null;
  upgradeCode: string | null;
  silentSwitch: string | null;
  silentWithProgressSwitch: string | null;
  installLocationSwitch: string | null;
  installModes: string | null;
  upgradeBehavior: string | null;
  scope: string | null;
  releaseDate: string | null;
  elevationRequirement: string | null;
  addedAt: string;
}

interface PackageDetailModalProps {
  pkg: LocalPackage | null;
  open: boolean;
  onClose: () => void;
  latestVersion?: string | null;
  onUpdateVersion?: (id: number, newVersion: string) => void;
  isUpdating?: boolean;
}

interface FieldRowProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}

function FieldRow({ icon, label, value, mono = true }: FieldRowProps) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="mt-0.5 text-muted-foreground shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-mono text-muted-foreground mb-0.5">{label}</div>
        <div className={`text-sm text-foreground break-all ${mono ? "font-mono" : ""}`}>{value}</div>
      </div>
    </div>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground font-mono">{label}</Label>
      {children}
    </div>
  );
}

function VersionCard({ ver }: { ver: PackageVersion }) {
  return (
    <div className="rounded-md border border-border bg-secondary/20 p-3 space-y-1.5 text-xs font-mono">
      <div className="flex items-center justify-between flex-wrap gap-1">
        <span className="inline-flex items-center gap-1 font-semibold text-foreground">
          <Tag size={11} />
          {ver.version}
        </span>
        <div className="flex flex-wrap gap-1">
          {ver.installerType && (
            <span className="rounded border border-border px-1.5 py-0.5 text-[10px] bg-secondary/50 text-muted-foreground uppercase">
              {ver.installerType}
            </span>
          )}
          {ver.architecture && (
            <span className="rounded border border-border px-1.5 py-0.5 text-[10px] bg-secondary/50 text-muted-foreground">
              {ver.architecture}
            </span>
          )}
          {ver.scope && (
            <span className="rounded border border-border px-1.5 py-0.5 text-[10px] bg-secondary/50 text-muted-foreground">
              {ver.scope}
            </span>
          )}
          {ver.installerLocale && (
            <span className="rounded border border-border px-1.5 py-0.5 text-[10px] bg-secondary/50 text-muted-foreground">
              {ver.installerLocale}
            </span>
          )}
          {ver.platform && (
            <span className="rounded border border-border px-1.5 py-0.5 text-[10px] bg-secondary/50 text-muted-foreground">
              {ver.platform}
            </span>
          )}
        </div>
      </div>

      {ver.installerUrl && (
        <div className="flex items-start gap-1.5 text-muted-foreground">
          <Link2 size={10} className="mt-0.5 shrink-0" />
          <a href={ver.installerUrl} target="_blank" rel="noreferrer"
            className="truncate text-primary hover:underline">
            {ver.installerUrl}
          </a>
        </div>
      )}

      {ver.installerSha256 && (
        <div className="flex items-start gap-1.5 text-muted-foreground">
          <ShieldCheck size={10} className="mt-0.5 shrink-0" />
          <span className="select-all break-all text-[10px] leading-relaxed">{ver.installerSha256}</span>
        </div>
      )}

      {ver.productCode && (
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <KeyRound size={10} className="shrink-0" />
          <span className="select-all text-amber-400">PC: {ver.productCode}</span>
        </div>
      )}
      {ver.upgradeCode && (
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <RefreshCw size={10} className="shrink-0" />
          <span className="select-all text-sky-400">UC: {ver.upgradeCode}</span>
        </div>
      )}

      {ver.packageFamilyName && (
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Hash size={10} className="shrink-0" />
          <span className="select-all text-purple-400">PFN: {ver.packageFamilyName}</span>
        </div>
      )}

      {(ver.silentSwitch || ver.silentWithProgressSwitch || ver.installLocationSwitch) && (
        <div className="flex items-start gap-1.5 text-muted-foreground">
          <Wrench size={10} className="mt-0.5 shrink-0" />
          <div className="space-y-0.5">
            {ver.silentSwitch && <div>Silent: <span className="text-foreground">{ver.silentSwitch}</span></div>}
            {ver.silentWithProgressSwitch && <div>SilentProgress: <span className="text-foreground">{ver.silentWithProgressSwitch}</span></div>}
            {ver.installLocationSwitch && <div>InstallLocation: <span className="text-foreground">{ver.installLocationSwitch}</span></div>}
          </div>
        </div>
      )}

      {ver.installModes && (
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Wrench size={10} className="shrink-0" />
          <span>Modes: <span className="text-foreground">{ver.installModes}</span></span>
        </div>
      )}

      <div className="flex flex-wrap gap-3 text-muted-foreground pt-0.5">
        {ver.minimumOsVersion && (
          <span className="flex items-center gap-1">
            <MonitorDown size={10} />
            Win ≥ {ver.minimumOsVersion}
          </span>
        )}
        {ver.upgradeBehavior && (
          <span className="flex items-center gap-1">
            <MonitorDown size={10} />
            {ver.upgradeBehavior}
          </span>
        )}
        {ver.elevationRequirement && (
          <span className="flex items-center gap-1">
            <ShieldCheck size={10} />
            {ver.elevationRequirement}
          </span>
        )}
        {ver.releaseDate && (
          <span className="flex items-center gap-1">
            <Calendar size={10} />
            {ver.releaseDate}
          </span>
        )}
      </div>
    </div>
  );
}

function VersionEditCard({
  ver,
  onChange,
}: {
  ver: Partial<PackageVersion> & { id: number; version: string };
  onChange: (id: number, field: string, value: string) => void;
}) {
  const f = (field: string, value: string) => onChange(ver.id, field, value);
  const v = (field: keyof PackageVersion) => (ver[field] as string) ?? "";

  return (
    <div className="rounded-md border border-border bg-secondary/20 p-3 space-y-3 text-xs">
      <div className="text-xs font-semibold font-mono text-primary flex items-center gap-1">
        <Tag size={11} /> Version hébergée #{ver.version}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <FormField label="Version">
          <Input className="h-7 text-xs font-mono" value={v("version")} onChange={e => f("version", e.target.value)} placeholder="1.2.3" />
        </FormField>
        <FormField label="Type d'installeur">
          <Select value={v("installerType") || "exe"} onValueChange={val => f("installerType", val)}>
            <SelectTrigger className="h-7 text-xs font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["exe", "msi", "msix", "zip", "inno", "nullsoft", "wix", "burn", "portable"].map(t => (
                <SelectItem key={t} value={t} className="text-xs font-mono">{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </div>

      <FormField label="URL de l'installeur">
        <Input className="h-7 text-xs font-mono" value={v("installerUrl")} onChange={e => f("installerUrl", e.target.value)} placeholder="https://…/setup.exe" />
      </FormField>

      <FormField label="SHA256 de l'installeur">
        <Input className="h-7 text-xs font-mono" value={v("installerSha256")} onChange={e => f("installerSha256", e.target.value)} placeholder="64 caractères hexadécimaux" />
      </FormField>

      <div className="grid grid-cols-2 gap-2">
        <FormField label="Architecture">
          <Select value={v("architecture") || "x64"} onValueChange={val => f("architecture", val)}>
            <SelectTrigger className="h-7 text-xs font-mono"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["x86", "x64", "arm", "arm64", "neutral"].map(a => (
                <SelectItem key={a} value={a} className="text-xs font-mono">{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Portée (scope)">
          <Select value={v("scope") || "machine"} onValueChange={val => f("scope", val)}>
            <SelectTrigger className="h-7 text-xs font-mono"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="machine" className="text-xs font-mono">machine</SelectItem>
              <SelectItem value="user" className="text-xs font-mono">user</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <FormField label="Product Code">
          <Input className="h-7 text-xs font-mono" value={v("productCode")} onChange={e => f("productCode", e.target.value)} placeholder="{GUID}" />
        </FormField>
        <FormField label="Upgrade Code">
          <Input className="h-7 text-xs font-mono" value={v("upgradeCode")} onChange={e => f("upgradeCode", e.target.value)} placeholder="{GUID}" />
        </FormField>
      </div>

      <FormField label="Switch silent">
        <Input className="h-7 text-xs font-mono" value={v("silentSwitch")} onChange={e => f("silentSwitch", e.target.value)} placeholder="/S" />
      </FormField>
      <FormField label="Switch silent avec progression">
        <Input className="h-7 text-xs font-mono" value={v("silentWithProgressSwitch")} onChange={e => f("silentWithProgressSwitch", e.target.value)} placeholder="/S" />
      </FormField>

      <div className="grid grid-cols-2 gap-2">
        <FormField label="UpgradeBehavior">
          <Select value={v("upgradeBehavior") || "install"} onValueChange={val => f("upgradeBehavior", val)}>
            <SelectTrigger className="h-7 text-xs font-mono"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="install" className="text-xs font-mono">install</SelectItem>
              <SelectItem value="uninstallPrevious" className="text-xs font-mono">uninstallPrevious</SelectItem>
              <SelectItem value="deny" className="text-xs font-mono">deny</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Date de sortie">
          <Input className="h-7 text-xs font-mono" type="date" value={v("releaseDate")} onChange={e => f("releaseDate", e.target.value)} />
        </FormField>
      </div>

      <FormField label="Locale installeur">
        <Input className="h-7 text-xs font-mono" value={v("installerLocale")} onChange={e => f("installerLocale", e.target.value)} placeholder="fr-FR" />
      </FormField>
      <FormField label="Version Windows minimale">
        <Input className="h-7 text-xs font-mono" value={v("minimumOsVersion")} onChange={e => f("minimumOsVersion", e.target.value)} placeholder="10.0.17763.0" />
      </FormField>
    </div>
  );
}

type PkgEditState = {
  name: string;
  publisher: string;
  version: string;
  description: string;
  license: string;
  homepage: string;
  publisherUrl: string;
  moniker: string;
  tags: string;
  installerUrl: string;
  installerSha256: string;
  productCode: string;
};

export function PackageDetailModal({
  pkg,
  open,
  onClose,
  latestVersion,
  onUpdateVersion,
  isUpdating,
}: PackageDetailModalProps) {
  const queryClient = useQueryClient();
  const [editMode, setEditMode] = useState(false);
  const [pkgEdit, setPkgEdit] = useState<PkgEditState>({
    name: "", publisher: "", version: "", description: "",
    license: "", homepage: "", publisherUrl: "", moniker: "",
    tags: "", installerUrl: "", installerSha256: "", productCode: "",
  });
  const [versionsEdit, setVersionsEdit] = useState<Record<number, Partial<PackageVersion>>>({});

  const { data: versions, isLoading: loadingVersions } = useQuery<PackageVersion[]>({
    queryKey: ["package-versions", pkg?.id],
    queryFn: async () => {
      const res = await fetch(`/api/packages/${pkg!.id}/versions`);
      if (!res.ok) throw new Error("Erreur chargement versions");
      return res.json();
    },
    enabled: open && pkg !== null,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (pkg && editMode) {
      setPkgEdit({
        name: pkg.name ?? "",
        publisher: pkg.publisher ?? "",
        version: pkg.version ?? "",
        description: (pkg as any).description ?? "",
        license: pkg.license ?? "",
        homepage: pkg.homepage ?? "",
        publisherUrl: (pkg as any).publisherUrl ?? "",
        moniker: (pkg as any).moniker ?? "",
        tags: (pkg as any).tags ?? "",
        installerUrl: pkg.installerUrl ?? "",
        installerSha256: pkg.installerSha256 ?? "",
        productCode: pkg.productCode ?? "",
      });
      const init: Record<number, Partial<PackageVersion>> = {};
      (versions ?? []).forEach(v => { init[v.id] = { ...v }; });
      setVersionsEdit(init);
    }
  }, [editMode, pkg, versions]);

  const savePkg = useMutation({
    mutationFn: async () => {
      const body: Record<string, string> = {};
      Object.entries(pkgEdit).forEach(([k, v]) => { if (v !== "") body[k] = v; });
      const res = await fetch(`/api/packages/${pkg!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["packages"] });
    },
  });

  const saveVersions = useMutation({
    mutationFn: async () => {
      await Promise.all(
        Object.entries(versionsEdit).map(async ([vidStr, data]) => {
          const vid = Number(vidStr);
          const body: Record<string, string> = {};
          Object.entries(data).forEach(([k, v]) => {
            if (v !== null && v !== undefined && v !== "" && k !== "id" && k !== "packageId" && k !== "addedAt") {
              body[k] = String(v);
            }
          });
          if (Object.keys(body).length === 0) return;
          const res = await fetch(`/api/packages/${pkg!.id}/versions/${vid}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (!res.ok) throw new Error(await res.text());
        }),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["package-versions", pkg?.id] });
    },
  });

  const handleSave = async () => {
    await savePkg.mutateAsync();
    await saveVersions.mutateAsync();
    setEditMode(false);
  };

  if (!pkg) return null;

  const isSaving = savePkg.isPending || saveVersions.isPending;

  const isOutdated =
    latestVersion != null &&
    pkg.version !== "latest" &&
    latestVersion !== pkg.version;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setEditMode(false); onClose(); } }}>
      <DialogContent className="max-w-xl bg-card border-border font-mono overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <DialogTitle className="flex items-center gap-2 text-base font-bold">
                <Package size={18} className="text-primary shrink-0" />
                <span className="truncate">{pkg.name}</span>
              </DialogTitle>
              <div className="text-xs text-primary/80 font-mono pt-0.5 truncate">{pkg.packageId}</div>
            </div>
            {!editMode ? (
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 gap-1.5 font-mono text-xs h-7 border-border"
                onClick={() => setEditMode(true)}
              >
                <Pencil size={12} /> Modifier
              </Button>
            ) : (
              <div className="flex gap-1.5 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 font-mono text-xs h-7 border-border"
                  onClick={() => setEditMode(false)}
                  disabled={isSaving}
                >
                  <X size={12} /> Annuler
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5 font-mono text-xs h-7 bg-primary text-primary-foreground"
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  <Save size={12} /> {isSaving ? "Sauvegarde…" : "Sauvegarder"}
                </Button>
              </div>
            )}
          </div>
        </DialogHeader>

        {!editMode ? (
          <>
            {/* Version badges */}
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="inline-flex items-center rounded border border-border px-2 py-0.5 text-xs font-semibold font-mono bg-secondary/50">
                <Tag size={11} className="mr-1.5" />
                {pkg.version}
              </span>
              {isOutdated && latestVersion && (
                <span className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-semibold font-mono text-amber-500">
                  <ArrowUpCircle size={11} />
                  {latestVersion} disponible
                </span>
              )}
              {!isOutdated && latestVersion && (
                <span className="inline-flex items-center rounded border border-green-500/40 bg-green-500/10 px-2 py-0.5 text-xs font-semibold font-mono text-green-500">
                  ✓ à jour
                </span>
              )}
            </div>

            <Separator className="bg-border" />

            {/* Package-level info */}
            <div className="divide-y divide-border/50">
              <FieldRow icon={<Building2 size={14} />} label="Éditeur" value={pkg.publisher} />
              {(pkg as any).author && (
                <FieldRow icon={<Building2 size={14} />} label="Auteur" value={(pkg as any).author} />
              )}
              {(pkg as any).moniker && (
                <FieldRow
                  icon={<Tag size={14} />}
                  label="Moniker (alias)"
                  value={<span className="text-primary">{(pkg as any).moniker}</span>}
                />
              )}
              {(pkg as any).tags && (
                <FieldRow
                  icon={<Tag size={14} />}
                  label="Tags"
                  value={
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {(pkg as any).tags.split(",").map((t: string) => t.trim()).filter(Boolean).map((tag: string) => (
                        <span key={tag} className="rounded border border-border px-1.5 py-0.5 text-[10px] bg-secondary/50 text-muted-foreground font-mono">
                          {tag}
                        </span>
                      ))}
                    </div>
                  }
                />
              )}
              {pkg.description && (
                <FieldRow
                  icon={<FileText size={14} />}
                  label="Description"
                  mono={false}
                  value={<span className="text-muted-foreground">{pkg.description}</span>}
                />
              )}
              {pkg.license && (
                <FieldRow
                  icon={<Scale size={14} />}
                  label="Licence"
                  value={
                    <span>
                      {pkg.license}
                      {(pkg as any).licenseUrl && (
                        <a href={(pkg as any).licenseUrl} target="_blank" rel="noreferrer"
                          className="ml-2 text-primary hover:underline inline-flex items-center gap-0.5 text-xs">
                          <ExternalLink size={10} /> URL
                        </a>
                      )}
                    </span>
                  }
                />
              )}
              {(pkg as any).copyright && (
                <FieldRow icon={<Scale size={14} />} label="Copyright" value={(pkg as any).copyright} />
              )}
              {pkg.homepage && (
                <FieldRow
                  icon={<Link2 size={14} />}
                  label="Site web du paquet"
                  value={
                    <a href={pkg.homepage} target="_blank" rel="noreferrer"
                      className="text-primary hover:underline flex items-center gap-1 truncate">
                      {pkg.homepage}
                      <ExternalLink size={11} className="shrink-0" />
                    </a>
                  }
                />
              )}
              {(pkg as any).publisherUrl && (
                <FieldRow
                  icon={<Link2 size={14} />}
                  label="Site de l'éditeur"
                  value={
                    <a href={(pkg as any).publisherUrl} target="_blank" rel="noreferrer"
                      className="text-primary hover:underline flex items-center gap-1 truncate">
                      {(pkg as any).publisherUrl}
                      <ExternalLink size={11} className="shrink-0" />
                    </a>
                  }
                />
              )}
              {(pkg as any).publisherSupportUrl && (
                <FieldRow
                  icon={<Link2 size={14} />}
                  label="Support"
                  value={
                    <a href={(pkg as any).publisherSupportUrl} target="_blank" rel="noreferrer"
                      className="text-primary hover:underline flex items-center gap-1 truncate">
                      {(pkg as any).publisherSupportUrl}
                      <ExternalLink size={11} className="shrink-0" />
                    </a>
                  }
                />
              )}
              {pkg.installerUrl && (
                <FieldRow
                  icon={<Link2 size={14} />}
                  label="URL installeur (défaut)"
                  value={
                    <a href={pkg.installerUrl} target="_blank" rel="noreferrer"
                      className="text-primary hover:underline flex items-center gap-1 truncate">
                      {pkg.installerUrl}
                      <ExternalLink size={11} className="shrink-0" />
                    </a>
                  }
                />
              )}
              {pkg.installerSha256 && (
                <FieldRow
                  icon={<ShieldCheck size={14} />}
                  label="SHA256 (défaut)"
                  value={<span className="select-all break-all text-xs text-muted-foreground">{pkg.installerSha256}</span>}
                />
              )}
              {pkg.productCode && (
                <FieldRow
                  icon={<KeyRound size={14} />}
                  label="Product Code"
                  value={<span className="text-amber-400 select-all uppercase tracking-wider">{pkg.productCode}</span>}
                />
              )}
              <FieldRow icon={<Hash size={14} />} label="ID interne" value={<span className="text-muted-foreground">#{pkg.id}</span>} />
              <FieldRow
                icon={<Calendar size={14} />}
                label="Ajouté le"
                value={format(new Date(pkg.addedAt), "d MMMM yyyy 'à' HH:mm", { locale: fr })}
              />
            </div>

            {/* Per-version details */}
            <Separator className="bg-border" />
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Layers size={14} className="text-primary" />
                <span className="text-sm font-semibold">Versions hébergées</span>
                <span className="text-xs text-muted-foreground">(table package_versions)</span>
              </div>

              {loadingVersions ? (
                <div className="space-y-2">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : !versions || versions.length === 0 ? (
                <div className="text-xs text-muted-foreground border border-dashed border-border rounded p-3 text-center">
                  Aucune version dans la table <code>package_versions</code>.<br />
                  <span className="opacity-70">La version principale provient de la table <code>packages</code>.</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {versions.map((v) => <VersionCard key={v.id} ver={v} />)}
                </div>
              )}
            </div>

            {/* Commandes rapides */}
            <Separator className="bg-border" />
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Terminal size={13} className="text-primary" />
                <span className="text-xs text-muted-foreground">Commandes rapides</span>
              </div>
              <div className="space-y-1.5">
                {[
                  { label: "Installer", cmd: `winget install --id ${pkg.packageId} --source monrepo` },
                  { label: "Désinstaller", cmd: `winget uninstall --id ${pkg.packageId}` },
                  { label: "Informations", cmd: `winget show --id ${pkg.packageId} --source monrepo` },
                ].map(({ label, cmd }) => (
                  <div key={label} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-20 shrink-0">{label}</span>
                    <code className="flex-1 text-xs bg-secondary/60 border border-border rounded px-2 py-1 text-foreground/90 select-all truncate">
                      {cmd}
                    </code>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer actions */}
            {isOutdated && latestVersion && onUpdateVersion && (
              <>
                <Separator className="bg-border" />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" className="font-mono border-border" onClick={onClose}>
                    Fermer
                  </Button>
                  <Button
                    size="sm"
                    className="font-mono bg-amber-500 hover:bg-amber-600 text-black gap-1.5"
                    disabled={isUpdating}
                    onClick={() => onUpdateVersion(pkg.id, latestVersion)}
                  >
                    <ArrowUpCircle size={14} />
                    Mettre à jour vers {latestVersion}
                  </Button>
                </div>
              </>
            )}
          </>
        ) : (
          /* ── EDIT MODE ─────────────────────────────────────────── */
          <div className="space-y-5 pt-1">
            {/* Package metadata */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Package size={14} className="text-primary" />
                <span className="text-sm font-semibold">Métadonnées du paquet</span>
              </div>
              <div className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <FormField label="Nom">
                    <Input className="h-7 text-xs font-mono" value={pkgEdit.name} onChange={e => setPkgEdit(p => ({ ...p, name: e.target.value }))} />
                  </FormField>
                  <FormField label="Éditeur">
                    <Input className="h-7 text-xs font-mono" value={pkgEdit.publisher} onChange={e => setPkgEdit(p => ({ ...p, publisher: e.target.value }))} />
                  </FormField>
                </div>
                <FormField label="Version">
                  <Input className="h-7 text-xs font-mono" value={pkgEdit.version} onChange={e => setPkgEdit(p => ({ ...p, version: e.target.value }))} placeholder="1.2.3" />
                </FormField>
                <FormField label="Description">
                  <Input className="h-7 text-xs" value={pkgEdit.description} onChange={e => setPkgEdit(p => ({ ...p, description: e.target.value }))} />
                </FormField>
                <div className="grid grid-cols-2 gap-2">
                  <FormField label="Licence">
                    <Input className="h-7 text-xs font-mono" value={pkgEdit.license} onChange={e => setPkgEdit(p => ({ ...p, license: e.target.value }))} placeholder="MIT" />
                  </FormField>
                  <FormField label="Moniker">
                    <Input className="h-7 text-xs font-mono" value={pkgEdit.moniker} onChange={e => setPkgEdit(p => ({ ...p, moniker: e.target.value }))} placeholder="7zip" />
                  </FormField>
                </div>
                <FormField label="Tags (séparés par virgule)">
                  <Input className="h-7 text-xs font-mono" value={pkgEdit.tags} onChange={e => setPkgEdit(p => ({ ...p, tags: e.target.value }))} placeholder="compression, archiver" />
                </FormField>
                <FormField label="Site web (homepage)">
                  <Input className="h-7 text-xs font-mono" value={pkgEdit.homepage} onChange={e => setPkgEdit(p => ({ ...p, homepage: e.target.value }))} placeholder="https://…" />
                </FormField>
                <FormField label="Site de l'éditeur">
                  <Input className="h-7 text-xs font-mono" value={pkgEdit.publisherUrl} onChange={e => setPkgEdit(p => ({ ...p, publisherUrl: e.target.value }))} placeholder="https://…" />
                </FormField>
              </div>
            </div>

            <Separator className="bg-border" />

            {/* Default installer */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Link2 size={14} className="text-primary" />
                <span className="text-sm font-semibold">Installeur par défaut</span>
                <span className="text-xs text-muted-foreground">(utilisé si non défini dans une version)</span>
              </div>
              <div className="space-y-2.5">
                <FormField label="URL de l'installeur">
                  <Input className="h-7 text-xs font-mono" value={pkgEdit.installerUrl} onChange={e => setPkgEdit(p => ({ ...p, installerUrl: e.target.value }))} placeholder="https://…/setup.exe" />
                </FormField>
                <FormField label="SHA256">
                  <Input className="h-7 text-xs font-mono" value={pkgEdit.installerSha256} onChange={e => setPkgEdit(p => ({ ...p, installerSha256: e.target.value }))} placeholder="64 caractères hex" />
                </FormField>
                <FormField label="Product Code">
                  <Input className="h-7 text-xs font-mono" value={pkgEdit.productCode} onChange={e => setPkgEdit(p => ({ ...p, productCode: e.target.value }))} placeholder="{GUID}" />
                </FormField>
              </div>
            </div>

            {/* Version entries */}
            {Object.keys(versionsEdit).length > 0 && (
              <>
                <Separator className="bg-border" />
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Layers size={14} className="text-primary" />
                    <span className="text-sm font-semibold">Versions hébergées</span>
                  </div>
                  <div className="space-y-3">
                    {Object.entries(versionsEdit).map(([vidStr, verData]) => (
                      <VersionEditCard
                        key={vidStr}
                        ver={verData as PackageVersion}
                        onChange={(id, field, value) => {
                          setVersionsEdit(prev => ({
                            ...prev,
                            [id]: { ...prev[id], [field]: value },
                          }));
                        }}
                      />
                    ))}
                  </div>
                </div>
              </>
            )}

            {savePkg.isError && (
              <div className="text-xs text-red-400 border border-red-400/30 rounded p-2">
                Erreur : {String(savePkg.error)}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
