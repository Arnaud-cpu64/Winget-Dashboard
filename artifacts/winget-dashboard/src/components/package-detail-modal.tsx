import React from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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
} from "lucide-react";
import type { ListPackagesResponseItem } from "@workspace/api-zod";
import { z } from "zod/v4";

type LocalPackage = z.infer<typeof ListPackagesResponseItem>;

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
}

function FieldRow({ icon, label, value }: FieldRowProps) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="mt-0.5 text-muted-foreground shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-mono text-muted-foreground mb-0.5">{label}</div>
        <div className="text-sm font-mono text-foreground break-all">{value}</div>
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

        {/* Main info */}
        <div className="divide-y divide-border/50">
          <FieldRow
            icon={<Building2 size={14} />}
            label="Éditeur"
            value={pkg.publisher}
          />
          {pkg.description && (
            <FieldRow
              icon={<FileText size={14} />}
              label="Description"
              value={<span className="whitespace-pre-wrap text-muted-foreground">{pkg.description}</span>}
            />
          )}
          {pkg.license && (
            <FieldRow
              icon={<Scale size={14} />}
              label="Licence"
              value={pkg.license}
            />
          )}
          {pkg.homepage && (
            <FieldRow
              icon={<Link2 size={14} />}
              label="Site web"
              value={
                <a
                  href={pkg.homepage}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline flex items-center gap-1 truncate"
                >
                  {pkg.homepage}
                  <ExternalLink size={11} className="shrink-0" />
                </a>
              }
            />
          )}

          <Separator className="bg-border !my-0" />

          {pkg.installerUrl && (
            <FieldRow
              icon={<Link2 size={14} />}
              label="URL de l'installeur"
              value={
                <a
                  href={pkg.installerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline flex items-center gap-1 break-all"
                >
                  {pkg.installerUrl}
                  <ExternalLink size={11} className="shrink-0" />
                </a>
              }
            />
          )}
          {pkg.installerSha256 && (
            <FieldRow
              icon={<ShieldCheck size={14} />}
              label="SHA-256 installeur"
              value={
                <span className="text-xs text-muted-foreground break-all font-mono select-all">
                  {pkg.installerSha256}
                </span>
              }
            />
          )}
          {pkg.productCode && (
            <FieldRow
              icon={<KeyRound size={14} />}
              label="Product Code (MSI/GUID)"
              value={
                <span className="uppercase tracking-wider select-all">{pkg.productCode}</span>
              }
            />
          )}
          <FieldRow
            icon={<Hash size={14} />}
            label="ID interne"
            value={<span className="text-muted-foreground">#{pkg.id}</span>}
          />
          <FieldRow
            icon={<Calendar size={14} />}
            label="Ajouté le"
            value={format(new Date(pkg.addedAt), "d MMMM yyyy 'à' HH:mm", { locale: fr })}
          />
        </div>

        {/* Winget commandes rapides */}
        <Separator className="bg-border" />
        <div>
          <div className="text-xs text-muted-foreground mb-2">Commandes rapides</div>
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
              <Button
                variant="outline"
                size="sm"
                className="font-mono border-border"
                onClick={onClose}
              >
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
