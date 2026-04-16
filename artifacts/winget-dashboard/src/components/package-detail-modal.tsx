import React from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
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
  architecture: string | null;
  productCode: string | null;
  upgradeCode: string | null;
  silentSwitch: string | null;
  silentWithProgressSwitch: string | null;
  installLocationSwitch: string | null;
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

function VersionCard({ ver }: { ver: PackageVersion }) {
  return (
    <div className="rounded-md border border-border bg-secondary/20 p-3 space-y-1.5 text-xs font-mono">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1 font-semibold text-foreground">
          <Tag size={11} />
          {ver.version}
        </span>
        <div className="flex gap-1.5">
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
        </div>
      </div>

      {ver.installerUrl && (
        <div className="flex items-start gap-1.5 text-muted-foreground">
          <Link2 size={10} className="mt-0.5 shrink-0" />
          <a
            href={ver.installerUrl}
            target="_blank"
            rel="noreferrer"
            className="truncate text-primary hover:underline"
          >
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
          <span className="select-all text-amber-400">{ver.productCode}</span>
        </div>
      )}

      {ver.upgradeCode && (
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <RefreshCw size={10} className="shrink-0" />
          <span className="select-all text-sky-400">UC: {ver.upgradeCode}</span>
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

      <div className="flex flex-wrap gap-3 text-muted-foreground pt-0.5">
        {ver.upgradeBehavior && (
          <span className="flex items-center gap-1">
            <MonitorDown size={10} />
            Upgrade: {ver.upgradeBehavior}
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

export function PackageDetailModal({
  pkg,
  open,
  onClose,
  latestVersion,
  onUpdateVersion,
  isUpdating,
}: PackageDetailModalProps) {
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

  if (!pkg) return null;

  const isOutdated =
    latestVersion != null &&
    pkg.version !== "latest" &&
    latestVersion !== pkg.version;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl bg-card border-border font-mono overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Package size={18} className="text-primary shrink-0" />
            <span className="truncate">{pkg.name}</span>
          </DialogTitle>
          <div className="text-xs text-primary/80 font-mono pt-0.5 truncate">{pkg.packageId}</div>
        </DialogHeader>

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
          {pkg.description && (
            <FieldRow
              icon={<FileText size={14} />}
              label="Description"
              mono={false}
              value={<span className="text-muted-foreground">{pkg.description}</span>}
            />
          )}
          {pkg.license && (
            <FieldRow icon={<Scale size={14} />} label="Licence" value={pkg.license} />
          )}
          {pkg.homepage && (
            <FieldRow
              icon={<Link2 size={14} />}
              label="Site web"
              value={
                <a href={pkg.homepage} target="_blank" rel="noreferrer"
                  className="text-primary hover:underline flex items-center gap-1 truncate">
                  {pkg.homepage}
                  <ExternalLink size={11} className="shrink-0" />
                </a>
              }
            />
          )}
          {pkg.productCode && (
            <FieldRow
              icon={<KeyRound size={14} />}
              label="Product Code (package)"
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
      </DialogContent>
    </Dialog>
  );
}
