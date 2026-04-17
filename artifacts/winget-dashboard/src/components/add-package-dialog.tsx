import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Package,
  Link2,
  ShieldCheck,
  Wrench,
  Tag,
  Building2,
  FileText,
  Scale,
  KeyRound,
  RefreshCw,
  Layers,
} from "lucide-react";

export interface AddPackageFormData {
  packageId: string;
  name: string;
  publisher: string;
  version: string;
  description?: string;
  license?: string;
  homepage?: string;
  installerUrl?: string;
  installerSha256?: string;
  installerType?: string;
  architecture?: string;
  scope?: string;
  productCode?: string;
  upgradeCode?: string;
  silentSwitch?: string;
  silentWithProgressSwitch?: string;
  upgradeBehavior?: string;
  moniker?: string;
  tags?: string;
}

interface AddPackageDialogProps {
  pkg: {
    packageId: string;
    name: string;
    publisher: string;
    version: string;
    description?: string | null;
    license?: string | null;
    homepage?: string | null;
  } | null;
  open: boolean;
  onClose: () => void;
  onConfirm: (data: AddPackageFormData) => void;
  isAdding: boolean;
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground font-mono">{label}</Label>
      {children}
    </div>
  );
}

export function AddPackageDialog({ pkg, open, onClose, onConfirm, isAdding }: AddPackageDialogProps) {
  const [form, setForm] = useState<AddPackageFormData>({
    packageId: "",
    name: "",
    publisher: "",
    version: "",
    description: "",
    license: "",
    homepage: "",
    installerUrl: "",
    installerSha256: "",
    installerType: "exe",
    architecture: "x64",
    scope: "machine",
    productCode: "",
    upgradeCode: "",
    silentSwitch: "",
    silentWithProgressSwitch: "",
    upgradeBehavior: "install",
    moniker: "",
    tags: "",
  });

  useEffect(() => {
    if (pkg) {
      setForm({
        packageId: pkg.packageId,
        name: pkg.name,
        publisher: pkg.publisher,
        version: pkg.version,
        description: pkg.description ?? "",
        license: pkg.license ?? "",
        homepage: pkg.homepage ?? "",
        installerUrl: "",
        installerSha256: "",
        installerType: "exe",
        architecture: "x64",
        scope: "machine",
        productCode: "",
        upgradeCode: "",
        silentSwitch: "",
        silentWithProgressSwitch: "",
        upgradeBehavior: "install",
        moniker: "",
        tags: "",
      });
    }
  }, [pkg]);

  const set = (k: keyof AddPackageFormData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  const handleConfirm = () => {
    const clean: AddPackageFormData = { ...form };
    (Object.keys(clean) as (keyof AddPackageFormData)[]).forEach(k => {
      if (clean[k] === "") (clean as any)[k] = undefined;
    });
    onConfirm(clean);
  };

  if (!pkg) return null;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-xl bg-card border-border font-mono overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Package size={18} className="text-primary shrink-0" />
            Ajouter au dépôt
          </DialogTitle>
          <div className="text-xs text-primary/80 font-mono pt-0.5 truncate">{pkg.packageId}</div>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          {/* Métadonnées */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Building2 size={14} className="text-primary" />
              <span className="text-sm font-semibold">Métadonnées</span>
            </div>
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <FormField label="Nom">
                  <Input className="h-7 text-xs" value={form.name} onChange={set("name")} />
                </FormField>
                <FormField label="Éditeur">
                  <Input className="h-7 text-xs" value={form.publisher} onChange={set("publisher")} />
                </FormField>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <FormField label="Version">
                  <Input className="h-7 text-xs" value={form.version} onChange={set("version")} placeholder="1.2.3" />
                </FormField>
                <FormField label="Moniker">
                  <Input className="h-7 text-xs" value={form.moniker} onChange={set("moniker")} placeholder="7zip" />
                </FormField>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <FormField label="Licence">
                  <Input className="h-7 text-xs" value={form.license} onChange={set("license")} placeholder="MIT" />
                </FormField>
                <FormField label="Tags (virgule)">
                  <Input className="h-7 text-xs" value={form.tags} onChange={set("tags")} placeholder="compression, archiver" />
                </FormField>
              </div>
              <FormField label="Description">
                <Input className="h-7 text-xs" value={form.description} onChange={set("description")} />
              </FormField>
              <FormField label="Site web">
                <Input className="h-7 text-xs" value={form.homepage} onChange={set("homepage")} placeholder="https://…" />
              </FormField>
            </div>
          </div>

          <Separator className="bg-border" />

          {/* Installeur */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Link2 size={14} className="text-primary" />
              <span className="text-sm font-semibold">Installeur</span>
            </div>
            <div className="space-y-2.5">
              <FormField label="URL de l'installeur *">
                <Input
                  className="h-7 text-xs"
                  value={form.installerUrl}
                  onChange={set("installerUrl")}
                  placeholder="https://example.com/setup.exe"
                />
              </FormField>
              <FormField label="SHA256 (64 caractères hex)">
                <Input
                  className="h-7 text-xs"
                  value={form.installerSha256}
                  onChange={set("installerSha256")}
                  placeholder="a1b2c3d4…"
                />
              </FormField>

              <div className="grid grid-cols-3 gap-2">
                <FormField label="Type">
                  <Select value={form.installerType ?? "exe"} onValueChange={v => setForm(p => ({ ...p, installerType: v }))}>
                    <SelectTrigger className="h-7 text-xs font-mono"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["exe", "msi", "msix", "zip", "inno", "nullsoft", "wix", "burn", "portable"].map(t => (
                        <SelectItem key={t} value={t} className="text-xs font-mono">{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Architecture">
                  <Select value={form.architecture ?? "x64"} onValueChange={v => setForm(p => ({ ...p, architecture: v }))}>
                    <SelectTrigger className="h-7 text-xs font-mono"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["x86", "x64", "arm", "arm64", "neutral"].map(a => (
                        <SelectItem key={a} value={a} className="text-xs font-mono">{a}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Portée">
                  <Select value={form.scope ?? "machine"} onValueChange={v => setForm(p => ({ ...p, scope: v }))}>
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
                  <Input className="h-7 text-xs" value={form.productCode} onChange={set("productCode")} placeholder="{GUID}" />
                </FormField>
                <FormField label="Upgrade Code">
                  <Input className="h-7 text-xs" value={form.upgradeCode} onChange={set("upgradeCode")} placeholder="{GUID}" />
                </FormField>
              </div>
            </div>
          </div>

          <Separator className="bg-border" />

          {/* Switches */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Wrench size={14} className="text-primary" />
              <span className="text-sm font-semibold">Switches d'installation</span>
              <span className="text-xs text-muted-foreground">(optionnel)</span>
            </div>
            <div className="space-y-2.5">
              <FormField label="Switch silent">
                <Input className="h-7 text-xs" value={form.silentSwitch} onChange={set("silentSwitch")} placeholder="/S" />
              </FormField>
              <FormField label="Switch silent avec progression">
                <Input className="h-7 text-xs" value={form.silentWithProgressSwitch} onChange={set("silentWithProgressSwitch")} placeholder="/S" />
              </FormField>
              <FormField label="UpgradeBehavior">
                <Select value={form.upgradeBehavior ?? "install"} onValueChange={v => setForm(p => ({ ...p, upgradeBehavior: v }))}>
                  <SelectTrigger className="h-7 text-xs font-mono"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="install" className="text-xs font-mono">install</SelectItem>
                    <SelectItem value="uninstallPrevious" className="text-xs font-mono">uninstallPrevious</SelectItem>
                    <SelectItem value="deny" className="text-xs font-mono">deny</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" size="sm" className="font-mono border-border" onClick={onClose} disabled={isAdding}>
            Annuler
          </Button>
          <Button
            size="sm"
            className="font-mono bg-primary text-primary-foreground gap-1.5"
            onClick={handleConfirm}
            disabled={isAdding}
          >
            {isAdding ? (
              <><div className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" /> Ajout…</>
            ) : (
              <><Package size={13} /> Ajouter au dépôt</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
