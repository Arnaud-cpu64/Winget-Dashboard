import React, { useState } from "react";
import {
  useListPackages,
  useGetPackageStats,
  useRemovePackage,
  useCheckPackageUpdates,
  getListPackagesQueryKey,
  getGetPackageStatsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search,
  Trash2,
  Package,
  Users,
  Clock,
  ExternalLink,
  Terminal,
  Shield,
  RefreshCw,
  ArrowUpCircle,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { format, formatDistanceToNow } from "date-fns";

const ONE_HOUR_MS = 60 * 60 * 1000;

export default function Dashboard() {
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: packages, isLoading: loadingPackages } = useListPackages();
  const { data: stats, isLoading: loadingStats } = useGetPackageStats();
  const removePackage = useRemovePackage();
  const {
    data: updateData,
    isLoading: loadingUpdates,
    dataUpdatedAt: updatesUpdatedAt,
  } = useCheckPackageUpdates({
    query: { refetchInterval: ONE_HOUR_MS, staleTime: ONE_HOUR_MS },
  });

  const filteredPackages = packages?.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.publisher.toLowerCase().includes(search.toLowerCase()) ||
      p.packageId.toLowerCase().includes(search.toLowerCase()),
  );

  const updatesAvailable = packages?.filter((p) => {
    if (p.version === "latest") return false;
    const latest = updateData?.updates?.[p.packageId];
    return latest != null && latest !== p.version;
  }).length ?? 0;

  const handleDelete = (id: number, name: string) => {
    removePackage.mutate(
      { id },
      {
        onSuccess: () => {
          toast({
            title: "Package removed",
            description: `Successfully removed ${name} from local repository.`,
          });
          queryClient.invalidateQueries({ queryKey: getListPackagesQueryKey() });
          queryClient.invalidateQueries({
            queryKey: getGetPackageStatsQueryKey(),
          });
        },
        onError: () => {
          toast({
            variant: "destructive",
            title: "Error removing package",
            description: "Could not remove package. Please try again.",
          });
        },
      },
    );
  };

  const getVersionStatus = (
    current: string,
    packageId: string,
  ): { latest: string | null; outdated: boolean } => {
    if (!updateData) return { latest: null, outdated: false };
    const latest = updateData.updates?.[packageId] ?? null;
    if (latest == null) return { latest: null, outdated: false };
    if (current === "latest") return { latest, outdated: false };
    return { latest, outdated: latest !== current };
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-mono font-bold tracking-tight text-foreground flex items-center gap-3">
          <Terminal size={28} className="text-primary" />
          Dashboard
        </h1>
        <p className="text-muted-foreground mt-2 font-mono text-sm">
          Local repository overview & package management
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-card/50 backdrop-blur border-border shadow-none">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground font-mono">
              Total Packages
            </CardTitle>
            <Package className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">
              {loadingStats ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                stats?.total || 0
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur border-border shadow-none">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground font-mono">
              Unique Publishers
            </CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">
              {loadingStats ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                stats?.publishers || 0
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur border-border shadow-none">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground font-mono">
              Recently Added (7d)
            </CardTitle>
            <Clock className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">
              {loadingStats ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                stats?.recentlyAdded || 0
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur border-border shadow-none">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground font-mono">
              Updates Available
            </CardTitle>
            <ArrowUpCircle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">
              {loadingUpdates ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <span className={updatesAvailable > 0 ? "text-amber-500" : ""}>
                  {updatesAvailable}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Packages Table */}
      <Card className="bg-card/50 backdrop-blur border-border shadow-none">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <CardTitle className="font-mono text-lg flex items-center gap-2">
              <Shield size={18} className="text-primary" />
              Hosted Packages
            </CardTitle>
            {updatesUpdatedAt > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground font-mono cursor-default">
                      <RefreshCw size={11} />
                      {formatDistanceToNow(new Date(updatesUpdatedAt), {
                        addSuffix: true,
                      })}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="font-mono text-xs">
                      Latest versions checked{" "}
                      {formatDistanceToNow(new Date(updatesUpdatedAt), {
                        addSuffix: true,
                      })}
                      . Auto-refreshes every hour.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter local packages..."
              className="pl-9 font-mono bg-background/50 border-border focus-visible:ring-primary h-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="rounded-md border-y border-border">
            <Table>
              <TableHeader className="bg-secondary/50">
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="font-mono w-[280px]">Name / ID</TableHead>
                  <TableHead className="font-mono">Publisher</TableHead>
                  <TableHead className="font-mono w-[110px]">Version</TableHead>
                  <TableHead className="font-mono w-[110px]">Disponible</TableHead>
                  <TableHead className="font-mono hidden md:table-cell">Added</TableHead>
                  <TableHead className="font-mono text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingPackages ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} className="border-border">
                      <TableCell>
                        <Skeleton className="h-10 w-[200px]" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-[120px]" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-[60px]" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-[60px]" />
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Skeleton className="h-5 w-[100px]" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-8 w-8 ml-auto" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : filteredPackages?.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-32 text-center text-muted-foreground font-mono"
                    >
                      No packages found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPackages?.map((pkg) => {
                    const { latest, outdated } = getVersionStatus(
                      pkg.version,
                      pkg.packageId,
                    );
                    return (
                      <TableRow
                        key={pkg.id}
                        className="border-border hover:bg-secondary/20 transition-colors"
                      >
                        <TableCell>
                          <div className="font-medium text-foreground">
                            {pkg.name}
                          </div>
                          <div className="text-xs text-muted-foreground font-mono">
                            {pkg.packageId}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {pkg.publisher}
                        </TableCell>
                        <TableCell>
                          {pkg.version === "latest" && loadingUpdates ? (
                            <Skeleton className="h-5 w-[60px]" />
                          ) : (
                            <span className="inline-flex items-center rounded border border-border px-2 py-0.5 text-xs font-semibold font-mono bg-secondary/50">
                              {pkg.version === "latest" ? (latest ?? "latest") : pkg.version}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {loadingUpdates ? (
                            <Skeleton className="h-5 w-[60px]" />
                          ) : latest == null ? (
                            <span className="text-xs text-muted-foreground font-mono">
                              —
                            </span>
                          ) : outdated ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-semibold font-mono text-amber-500 cursor-default">
                                    <ArrowUpCircle size={11} />
                                    {latest}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="font-mono text-xs">
                                    Update available: {pkg.version} → {latest}
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <span className="inline-flex items-center rounded border border-green-500/40 bg-green-500/10 px-2 py-0.5 text-xs font-semibold font-mono text-green-500">
                              ✓ up to date
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground font-mono">
                          {format(new Date(pkg.addedAt), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {pkg.homepage && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-primary"
                                asChild
                              >
                                <a
                                  href={pkg.homepage}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <ExternalLink size={16} />
                                </a>
                              </Button>
                            )}
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                >
                                  <Trash2 size={16} />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="bg-card border-border">
                                <AlertDialogHeader>
                                  <AlertDialogTitle className="font-mono">
                                    Remove package?
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will remove{" "}
                                    <span className="font-mono text-foreground font-bold">
                                      {pkg.packageId}
                                    </span>{" "}
                                    from your local repository. Devices pulling
                                    from this repo will no longer be able to
                                    install or update it.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel className="font-mono bg-secondary hover:bg-secondary/80 border-0 text-foreground">
                                    Cancel
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() =>
                                      handleDelete(pkg.id, pkg.name)
                                    }
                                    className="font-mono bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Remove
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
