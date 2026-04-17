import React, { useState } from "react";
import {
  useSearchWinget,
  useListPackages,
  useAddPackage,
  getListPackagesQueryKey,
  getGetPackageStatsQueryKey,
} from "@workspace/api-client-react";
import { useDebounce } from "@/lib/use-debounce";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Search as SearchIcon, Download, Globe, Scale, BookOpen, Database } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function SearchPage() {
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounce(searchInput, 300);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: searchResults, isLoading: isSearching, isFetching } = useSearchWinget(
    { q: debouncedSearch, limit: 20 },
    { query: { enabled: debouncedSearch.length > 0 } },
  );

  const { data: localPackages } = useListPackages();
  const addPackage = useAddPackage();

  const isPackageAdded = (packageId: string) =>
    localPackages?.some((p) => p.packageId === packageId) || false;

  const handleAdd = (pkg: any) => {
    addPackage.mutate(
      { data: pkg },
      {
        onSuccess: () => {
          toast({
            title: "Package ajouté",
            description: `${pkg.name} a été ajouté. Les détails d'installation ont été récupérés automatiquement.`,
          });
          queryClient.invalidateQueries({ queryKey: getListPackagesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetPackageStatsQueryKey() });
        },
        onError: (error: any) => {
          toast({
            variant: "destructive",
            title: "Échec de l'ajout",
            description: error.message || "Une erreur inattendue s'est produite.",
          });
        },
      },
    );
  };

  const showLoading = isSearching && isFetching && debouncedSearch.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-mono font-bold tracking-tight text-foreground flex items-center gap-3">
          <Database size={28} className="text-primary" />
          Recherche en amont
        </h1>
        <p className="text-muted-foreground mt-2 font-mono text-sm">
          Recherchez dans le dépôt officiel Windows Package Manager et ajoutez des packages à votre instance locale.
          Les détails d&apos;installation sont récupérés automatiquement depuis les manifests winget.
        </p>
      </div>

      <div className="relative max-w-2xl">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <SearchIcon className="h-5 w-5 text-muted-foreground" />
        </div>
        <Input
          placeholder="Rechercher par ID, nom ou éditeur... (ex: Microsoft.PowerToys)"
          className="pl-10 h-12 font-mono text-base bg-card/50 backdrop-blur border-border focus-visible:ring-primary shadow-sm"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        {isFetching && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
            <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        )}
      </div>

      <div className="space-y-4">
        {debouncedSearch.length === 0 ? (
          <div className="h-48 flex items-center justify-center border border-dashed border-border rounded-lg bg-card/20">
            <p className="text-muted-foreground font-mono text-sm">
              Saisissez une requête pour parcourir le dépôt officiel.
            </p>
          </div>
        ) : showLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="bg-card/50 border-border">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-[200px]" />
                    <Skeleton className="h-4 w-[300px]" />
                  </div>
                  <Skeleton className="h-9 w-[120px]" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : searchResults?.length === 0 ? (
          <div className="h-48 flex items-center justify-center border border-dashed border-border rounded-lg bg-card/20">
            <p className="text-muted-foreground font-mono text-sm">
              Aucun package trouvé pour &laquo;&nbsp;{debouncedSearch}&nbsp;&raquo;.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {searchResults?.map((pkg) => {
              const added = isPackageAdded(pkg.packageId);
              const isAddingThis =
                addPackage.isPending &&
                addPackage.variables?.data?.packageId === pkg.packageId;

              return (
                <Card
                  key={pkg.packageId}
                  className="bg-card/50 backdrop-blur border-border hover:border-primary/50 transition-colors overflow-hidden group"
                >
                  <CardContent className="p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-foreground text-lg truncate">{pkg.name}</h3>
                        <span className="inline-flex items-center rounded border border-border px-1.5 py-0.5 text-[10px] font-semibold font-mono bg-secondary/50 text-muted-foreground">
                          v{pkg.version}
                        </span>
                      </div>
                      <div className="font-mono text-xs text-primary/80 mb-2 truncate">
                        {pkg.packageId}
                      </div>
                      {pkg.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2 mb-3 max-w-3xl">
                          {pkg.description}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-4 text-xs font-mono text-muted-foreground">
                        {pkg.publisher && (
                          <div className="flex items-center gap-1.5">
                            <BookOpen size={12} />
                            {pkg.publisher}
                          </div>
                        )}
                        {pkg.license && (
                          <div className="flex items-center gap-1.5">
                            <Scale size={12} />
                            {pkg.license}
                          </div>
                        )}
                        {pkg.homepage && (
                          <a
                            href={pkg.homepage}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1.5 hover:text-primary transition-colors"
                          >
                            <Globe size={12} />
                            Site web
                          </a>
                        )}
                      </div>
                    </div>

                    <div className="flex-shrink-0 w-full sm:w-auto mt-2 sm:mt-0">
                      <Button
                        onClick={() => handleAdd(pkg)}
                        disabled={added || isAddingThis}
                        className={`w-full sm:w-[140px] font-mono ${
                          added
                            ? "bg-secondary text-muted-foreground opacity-100 border-border"
                            : "bg-primary text-primary-foreground hover:bg-primary/90"
                        }`}
                        variant={added ? "outline" : "default"}
                      >
                        {added ? (
                          "Déjà ajouté"
                        ) : isAddingThis ? (
                          <div className="flex items-center gap-2">
                            <div className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                            Ajout en cours...
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Download size={16} />
                            Ajouter au dépôt
                          </div>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
