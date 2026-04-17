import { Router, type IRouter } from "express";
import { ProxyAgent } from "undici";
import yaml from "js-yaml";
import { SearchWingetQueryParams, SearchWingetResponse } from "@workspace/api-zod";

const router: IRouter = Router();

const GITHUB_API = "https://api.github.com";
const REPO = "microsoft/winget-pkgs";
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

const PROXY_URL =
  process.env.HTTPS_PROXY ||
  process.env.https_proxy ||
  process.env.HTTP_PROXY ||
  process.env.http_proxy ||
  null;

const proxyAgent = PROXY_URL ? new ProxyAgent(PROXY_URL) : null;

// Valide le token GitHub au démarrage — si invalide, on ne l'utilise pas
// (on tombe sur 60 req/h anonyme plutôt que des erreurs 401 immédiates)
let validatedToken: string | null = null;
(async () => {
  const raw = process.env.GITHUB_TOKEN;
  if (!raw) return;
  try {
    const opts: RequestInit & { dispatcher?: ProxyAgent } = {
      headers: {
        Authorization: `Bearer ${raw}`,
        "User-Agent": "winget-repo-dashboard/1.0",
        Accept: "application/vnd.github.v3+json",
      },
      signal: AbortSignal.timeout(5000),
    };
    if (proxyAgent) opts.dispatcher = proxyAgent;
    const r = await fetch(`${GITHUB_API}/rate_limit`, opts);
    if (r.ok) {
      validatedToken = raw;
      const data = (await r.json()) as { rate?: { limit?: number; remaining?: number } };
      console.log(`[winget] GitHub token OK — limit: ${data?.rate?.limit ?? "?"}, remaining: ${data?.rate?.remaining ?? "?"}`);
    } else {
      console.warn(`[winget] GitHub token invalide (${r.status}) — mode anonyme (60 req/h)`);
    }
  } catch (e) {
    console.warn(`[winget] Impossible de valider le token GitHub — mode anonyme`);
  }
})();

interface GitHubContent {
  name: string;
  path: string;
  type: "file" | "dir";
}

interface CacheEntry<T> {
  data: T;
  ts: number;
}

const publishersCache = new Map<string, CacheEntry<string[]>>();
const packagesCache = new Map<string, CacheEntry<string[]>>();
const versionCache = new Map<string, CacheEntry<string>>();

function compareVersions(a: string, b: string): number {
  const clean = (v: string) => v.split(/[-+]/)[0]!;
  const aParts = clean(a).split(".").map((n) => parseInt(n, 10) || 0);
  const bParts = clean(b).split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const diff = (aParts[i] ?? 0) - (bParts[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export async function getPackageVersion(packageId: string): Promise<string> {
  const cached = versionCache.get(packageId);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;

  const parts = packageId.split(".");
  if (parts.length < 2) return "latest";
  const firstChar = parts[0]?.[0]?.toLowerCase();
  if (!firstChar) return "latest";

  const path = `manifests/${firstChar}/${parts.join("/")}`;
  const contents = await fetchGitHubContents(path);

  const versions = contents
    .filter((c) => c.type === "dir" && /^\d/.test(c.name))
    .map((c) => c.name);

  if (versions.length === 0) return "latest";

  versions.sort((a, b) => compareVersions(b, a));
  const version = versions[0] ?? "latest";
  versionCache.set(packageId, { data: version, ts: Date.now() });
  return version;
}

// Popular packages for instant results without API calls.
// Format: [packageId, friendlyName, ...searchTerms]
const POPULAR_PACKAGES: [string, string, ...string[]][] = [
  ["7zip.7zip", "7-Zip", "7zip", "zip", "archive"],
  ["Ablaze.Floorp", "Floorp Browser", "floorp", "browser"],
  ["Adobe.Acrobat.Reader.64-bit", "Adobe Acrobat Reader", "acrobat", "pdf", "adobe reader"],
  ["Audacity.Audacity", "Audacity", "audacity", "audio", "sound editor"],
  ["Balena.Etcher", "balenaEtcher", "etcher", "balena", "usb", "flash"],
  ["Brave.Brave", "Brave Browser", "brave", "browser"],
  ["BurntSushi.ripgrep.MSVC", "ripgrep", "ripgrep", "rg", "grep"],
  ["Canonical.Ubuntu", "Ubuntu (WSL)", "ubuntu", "wsl"],
  ["Cloudflare.Warp", "Cloudflare WARP", "warp", "cloudflare", "vpn"],
  ["Discord.Discord", "Discord", "discord", "chat"],
  ["Docker.DockerDesktop", "Docker Desktop", "docker", "container"],
  ["Elgato.4KCaptureUtility", "Elgato 4K Capture Utility", "elgato", "capture"],
  ["Figma.Figma", "Figma", "figma", "design"],
  ["FiloSottile.mkcert", "mkcert", "mkcert", "cert", "ssl"],
  ["Git.Git", "Git", "git", "version control"],
  ["GitHub.GitHubDesktop", "GitHub Desktop", "github desktop", "github"],
  ["GitHub.cli", "GitHub CLI", "gh", "github cli"],
  ["GIMP.GIMP", "GIMP", "gimp", "image editor", "photo"],
  ["Google.Chrome", "Google Chrome", "chrome", "google chrome", "browser"],
  ["Inkscape.Inkscape", "Inkscape", "inkscape", "svg", "vector"],
  ["JanDeDobbeleer.OhMyPosh", "Oh My Posh", "ohmyposh", "prompt"],
  ["JetBrains.IntelliJIDEA.Community", "IntelliJ IDEA Community", "intellij", "java ide"],
  ["JetBrains.PyCharm.Community", "PyCharm Community", "pycharm", "python ide"],
  ["JetBrains.WebStorm", "WebStorm", "webstorm", "js ide"],
  ["Kubernetes.kubectl", "kubectl", "kubectl", "kubernetes", "k8s"],
  ["LGUG2Z.komorebi", "komorebi", "komorebi", "tiling", "window manager"],
  ["Microsoft.AzureCLI", "Azure CLI", "az", "azure cli", "azure"],
  ["Microsoft.AzureDataStudio", "Azure Data Studio", "azure data studio", "ads"],
  ["Microsoft.DotNet.Runtime.8", ".NET Runtime 8", "dotnet", ".net", "dotnet runtime"],
  ["Microsoft.DotNet.SDK.9", ".NET SDK 9", "dotnet sdk", ".net sdk"],
  ["Microsoft.Edge", "Microsoft Edge", "edge", "browser"],
  ["Microsoft.Git", "Git for Windows (Microsoft build)", "git windows"],
  ["Microsoft.OneDrive", "OneDrive", "onedrive", "cloud storage"],
  ["Microsoft.OpenSSH.Beta", "OpenSSH", "openssh", "ssh"],
  ["Microsoft.PowerShell", "PowerShell", "powershell", "pwsh"],
  ["Microsoft.PowerToys", "PowerToys", "powertoys"],
  ["Microsoft.SQLServerManagementStudio", "SSMS", "ssms", "sql server management studio"],
  ["Microsoft.Teams", "Microsoft Teams", "teams", "ms teams"],
  ["Microsoft.VisualStudio.2022.Community", "Visual Studio 2022 Community", "visual studio", "vs2022"],
  ["Microsoft.VisualStudioCode", "Visual Studio Code", "vscode", "vs code", "visual studio code", "code"],
  ["Microsoft.WindowsTerminal", "Windows Terminal", "windows terminal", "terminal", "wt"],
  ["Mobaxterm.Mobaxterm", "MobaXterm", "mobaxterm", "ssh client"],
  ["Mozilla.Firefox", "Mozilla Firefox", "firefox", "browser"],
  ["Mozilla.Firefox.ESR", "Mozilla Firefox ESR", "firefox esr"],
  ["Neovim.Neovim", "Neovim", "neovim", "nvim", "vim"],
  ["Notepad++.Notepad++", "Notepad++", "notepad++", "notepad", "text editor"],
  ["OBSProject.OBSStudio", "OBS Studio", "obs", "streaming", "recording"],
  ["OpenJS.NodeJS", "Node.js LTS", "nodejs", "node", "npm"],
  ["OpenJS.NodeJS.LTS", "Node.js LTS", "nodejs lts", "node lts"],
  ["Oracle.JDK.21", "Oracle JDK 21", "jdk", "java"],
  ["Postman.Postman", "Postman", "postman", "api client"],
  ["Python.Python.3.12", "Python 3.12", "python", "python3"],
  ["Python.Python.3.13", "Python 3.13", "python 3.13"],
  ["PuTTY.PuTTY", "PuTTY", "putty", "ssh"],
  ["RARLab.WinRAR", "WinRAR", "winrar", "archive", "rar"],
  ["Rustlang.Rust.GNU", "Rust (GNU)", "rust", "rustup"],
  ["Rustlang.Rustup", "rustup", "rustup", "rust"],
  ["ShareX.ShareX", "ShareX", "sharex", "screenshot", "screen capture"],
  ["SlackTechnologies.Slack", "Slack", "slack", "chat"],
  ["Spotify.Spotify", "Spotify", "spotify", "music"],
  ["Telegram.TelegramDesktop", "Telegram Desktop", "telegram", "chat"],
  ["TorProject.TorBrowser", "Tor Browser", "tor", "tor browser", "browser"],
  ["valinet.ExplorerPatcher", "ExplorerPatcher", "explorerpatcher"],
  ["Valve.Steam", "Steam", "steam", "gaming"],
  ["VideoLAN.VLC", "VLC Media Player", "vlc", "media player"],
  ["vim.vim", "Vim", "vim", "text editor"],
  ["WiresharkFoundation.Wireshark", "Wireshark", "wireshark", "network", "packet"],
  ["WinSCP.WinSCP", "WinSCP", "winscp", "sftp", "ftp"],
  ["Zoom.Zoom", "Zoom", "zoom", "video call"],
];

// ── Manifest installer fetcher ─────────────────────────────────────────────

export interface InstallerEntry {
  architecture: string;
  installerType: string;
  installerUrl: string;
  installerSha256: string;
  scope: string | null;
  productCode: string | null;
  upgradeCode: string | null;
  packageFamilyName: string | null;
  silentSwitch: string | null;
  silentWithProgressSwitch: string | null;
  installLocationSwitch: string | null;
  installModes: string | null;
  upgradeBehavior: string | null;
  minimumOsVersion: string | null;
  installerLocale: string | null;
  releaseDate: string | null;
  elevationRequirement: string | null;
}

async function fetchRawFile(rawUrl: string): Promise<string | null> {
  const headers: Record<string, string> = {
    "User-Agent": "winget-repo-dashboard/1.0",
    Accept: "text/plain",
  };
  if (validatedToken) headers["Authorization"] = `Bearer ${validatedToken}`;
  const fetchOptions: RequestInit & { dispatcher?: ProxyAgent } = {
    headers,
    signal: AbortSignal.timeout(10000),
  };
  if (proxyAgent) fetchOptions.dispatcher = proxyAgent;
  const res = await fetch(rawUrl, fetchOptions);
  if (!res.ok) return null;
  return res.text();
}

function str(v: unknown): string | null {
  if (v == null) return null;
  return String(v);
}

/** Converts a YAML date value (may be a JS Date object) to YYYY-MM-DD string. */
function strDate(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v);
  // Accept YYYY-MM-DD format directly
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Try parsing other formats
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

/**
 * Fetches and parses the installer manifest YAML from winget-pkgs on GitHub.
 * Returns an array of installer entries (one per architecture typically).
 */
export async function fetchInstallerManifest(
  packageId: string,
  version: string,
): Promise<InstallerEntry[]> {
  const parts = packageId.split(".");
  if (parts.length < 2) return [];
  const firstChar = parts[0]![0]!.toLowerCase();
  const manifestPath = `manifests/${firstChar}/${parts.join("/")}/${version}`;
  const BASE = `https://raw.githubusercontent.com/microsoft/winget-pkgs/master/${manifestPath}`;

  // Try new manifest format first (no version in filename), then legacy format
  let text: string | null = null;
  for (const fileName of [
    `${packageId}.installer.yaml`,
    `${packageId}.installer.${version}.yaml`,
  ]) {
    try {
      text = await fetchRawFile(`${BASE}/${fileName}`);
      if (text && !text.startsWith("404")) break;
    } catch {
      /* try next */
    }
  }
  if (!text || text.startsWith("404")) return [];

  let doc: any;
  try {
    doc = yaml.load(text);
  } catch {
    return [];
  }
  if (!doc || typeof doc !== "object") return [];

  // Top-level defaults (some manifests put shared fields at root)
  const topType = str(doc.InstallerType);
  const topScope = str(doc.Scope);
  const topLocale = str(doc.InstallerLocale);
  const topMinOs = str(doc.MinimumOSVersion);
  const topUpgradeBehavior = str(doc.UpgradeBehavior);
  const topElevation = str(doc.ElevationRequirement);
  const topReleaseDate = strDate(doc.ReleaseDate);
  const topInstallModes = Array.isArray(doc.InstallModes)
    ? (doc.InstallModes as string[]).join(",")
    : null;
  const topSwitches = doc.InstallerSwitches ?? {};
  const topSilent = str(topSwitches.Silent);
  const topSilentProgress = str(topSwitches.SilentWithProgress);
  const topInstallLocation = str(topSwitches.InstallLocation);

  const rawInstallers: any[] = Array.isArray(doc.Installers) ? doc.Installers : [];

  // If no Installers array, treat the doc itself as a single installer
  if (rawInstallers.length === 0 && doc.InstallerUrl) {
    rawInstallers.push(doc);
  }

  return rawInstallers
    .filter((i) => i.InstallerUrl)
    .map((i) => {
      const sw = i.InstallerSwitches ?? {};
      const modes = Array.isArray(i.InstallModes)
        ? (i.InstallModes as string[]).join(",")
        : topInstallModes;
      return {
        architecture: str(i.Architecture) ?? "x64",
        installerType: str(i.InstallerType) ?? topType ?? "exe",
        installerUrl: str(i.InstallerUrl)!,
        installerSha256: str(i.InstallerSha256) ?? "",
        scope: str(i.Scope) ?? topScope,
        productCode: str(i.ProductCode) ?? null,
        upgradeCode: str(i.UpgradeCode) ?? null,
        packageFamilyName: str(i.PackageFamilyName) ?? null,
        silentSwitch: str(sw.Silent) ?? topSilent,
        silentWithProgressSwitch: str(sw.SilentWithProgress) ?? topSilentProgress,
        installLocationSwitch: str(sw.InstallLocation) ?? topInstallLocation,
        installModes: modes,
        upgradeBehavior: str(i.UpgradeBehavior) ?? topUpgradeBehavior,
        minimumOsVersion: str(i.MinimumOSVersion) ?? topMinOs,
        installerLocale: str(i.InstallerLocale) ?? topLocale,
        releaseDate: strDate(i.ReleaseDate) ?? topReleaseDate,
        elevationRequirement: str(i.ElevationRequirement) ?? topElevation,
      } satisfies InstallerEntry;
    });
}

// ────────────────────────────────────────────────────────────────────────────

async function fetchGitHubContents(path: string): Promise<GitHubContent[]> {
  const url = `${GITHUB_API}/repos/${REPO}/contents/${path}`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "winget-repo-dashboard/1.0",
  };
  if (validatedToken) headers["Authorization"] = `Bearer ${validatedToken}`;

  const fetchOptions: RequestInit & { dispatcher?: ProxyAgent } = {
    headers,
    signal: AbortSignal.timeout(10000),
  };
  if (proxyAgent) fetchOptions.dispatcher = proxyAgent;

  const response = await fetch(url, fetchOptions);
  if (!response.ok) return [];
  const data = (await response.json()) as unknown;
  return Array.isArray(data) ? (data as GitHubContent[]) : [];
}

async function getPublishers(letter: string): Promise<string[]> {
  const cached = publishersCache.get(letter);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;
  const contents = await fetchGitHubContents(`manifests/${letter}`);
  const publishers = contents.filter((c) => c.type === "dir").map((c) => c.name);
  publishersCache.set(letter, { data: publishers, ts: Date.now() });
  return publishers;
}

async function getPackages(letter: string, publisher: string): Promise<string[]> {
  const key = `${letter}/${publisher}`;
  const cached = packagesCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;
  const contents = await fetchGitHubContents(`manifests/${letter}/${publisher}`);
  const packages = contents.filter((c) => c.type === "dir").map((c) => c.name);
  packagesCache.set(key, { data: packages, ts: Date.now() });
  return packages;
}

function camelToWords(name: string): string {
  return name
    .replace(/([A-Z][a-z]+|[A-Z]+(?=[A-Z][a-z]))/g, " $1")
    .replace(/\s+/g, " ")
    .trim();
}

function scorePublisher(q: string, pub: string): number {
  const p = pub.toLowerCase();
  if (p === q) return 100;
  if (p.startsWith(q)) return 90;
  if (q.startsWith(p)) return 80;
  if (p.includes(q)) return 60;
  if (q.includes(p)) return 50;
  const qWords = q.split(/[\s.]/g).filter(Boolean);
  if (qWords.every((w) => p.includes(w))) return 40;
  if (qWords.some((w) => p.includes(w))) return 20;
  return 0;
}

function scorePackage(query: string, packageId: string, packageName: string, publisher: string): number {
  const q = query.toLowerCase();
  const id = packageId.toLowerCase();
  const name = packageName.toLowerCase();
  const pub = publisher.toLowerCase();
  if (id === q) return 100;
  if (id.startsWith(q)) return 90;
  if (name === q || pub === q) return 85;
  if (id.includes(q)) return 70;
  if (name.includes(q) || pub.includes(q)) return 60;
  const words = q.split(/[\s.]/g).filter(Boolean);
  if (words.length > 1 && words.every((w) => id.includes(w))) return 55;
  if (words.some((w) => w.length > 3 && (id.includes(w) || name.includes(w)))) return 30;
  return 0;
}

/** Search the static popular packages list. Returns scored results. */
function searchPopularPackages(query: string): Array<{ packageId: string; name: string; publisher: string; version: string; description: null; license: null; homepage: null; _score: number }> {
  const q = query.toLowerCase();
  const results = [];
  for (const [packageId, friendlyName, ...terms] of POPULAR_PACKAGES) {
    const publisher = packageId.split(".")[0];
    // Score: check friendly name, packageId, and all search terms
    let best = scorePackage(q, packageId, friendlyName, publisher);
    for (const term of terms) {
      if (term.includes(q) || q.includes(term)) {
        const s = q === term ? 95 : q.startsWith(term) || term.startsWith(q) ? 85 : 60;
        if (s > best) best = s;
      }
    }
    if (best > 0) {
      results.push({ packageId, name: friendlyName, publisher, version: "latest", description: null, license: null, homepage: null, _score: best });
    }
  }
  return results;
}

router.get("/winget/search", async (req, res): Promise<void> => {
  const parsed = SearchWingetQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { q, limit = 30 } = parsed.data;
  const query = q.trim();

  if (!query) {
    res.json([]);
    return;
  }

  try {
    const seen = new Set<string>();
    const results: Array<{ packageId: string; name: string; publisher: string; version: string; description: null; license: null; homepage: null; _score: number }> = [];

    // 1. Search static popular packages first (fast, no API calls)
    for (const r of searchPopularPackages(query)) {
      seen.add(r.packageId);
      results.push(r);
    }

    // 2. Supplement with live GitHub API search
    const queryLower = query.toLowerCase();
    const lettersToSearch = new Set<string>();
    const addLetter = (s: string) => {
      if (s) {
        const l = s[0].toLowerCase();
        if (/^[a-z]$/.test(l)) lettersToSearch.add(l);
      }
    };
    addLetter(query);
    query.split(/[\s.]/g).forEach(addLetter);

    for (const letter of lettersToSearch) {
      let publishers: string[];
      try {
        publishers = await getPublishers(letter);
      } catch {
        continue;
      }

      // Score publishers, take top 5 most relevant
      const scoredPublishers = publishers
        .map((pub) => ({ pub, score: scorePublisher(queryLower, pub) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      for (const { pub: publisher } of scoredPublishers) {
        if (results.length >= limit * 3) break;
        let packages: string[];
        try {
          packages = await getPackages(letter, publisher);
        } catch {
          continue;
        }

        for (const pkg of packages) {
          if (results.length >= limit * 3) break;
          const packageId = `${publisher}.${pkg}`;
          if (seen.has(packageId)) continue;
          const name = camelToWords(pkg);
          const s = scorePackage(query, packageId, name, publisher);
          if (s > 0) {
            seen.add(packageId);
            results.push({ packageId, name, publisher, version: "latest", description: null, license: null, homepage: null, _score: s });
          }
        }
      }
    }

    results.sort((a, b) => b._score - a._score);
    const topResults = results.slice(0, limit).map(({ _score: _s, ...rest }) => rest);

    // Résolution de version : séquentielle, limitée aux 5 premiers non-cachés
    // pour éviter d'épuiser le quota GitHub (60 req/h sans token).
    const MAX_VERSION_CALLS = 5;
    const versionsMap = new Map<string, string>();
    let calls = 0;

    for (const pkg of topResults) {
      const cached = versionCache.get(pkg.packageId);
      if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
        versionsMap.set(pkg.packageId, cached.data);
        continue;
      }
      if (calls >= MAX_VERSION_CALLS) continue;
      calls++;
      try {
        const v = await Promise.race([
          getPackageVersion(pkg.packageId),
          new Promise<string>((resolve) => setTimeout(() => resolve("latest"), 3000)),
        ]);
        versionsMap.set(pkg.packageId, v);
      } catch {
        versionsMap.set(pkg.packageId, "latest");
      }
    }

    const finalResults = topResults.map((pkg) => ({
      ...pkg,
      version: versionsMap.get(pkg.packageId) ?? pkg.version,
    }));

    res.json(SearchWingetResponse.parse(finalResults));
  } catch (err) {
    req.log.error({ err }, "Error searching winget packages");
    res.status(502).json({ error: "Failed to search winget packages" });
  }
});

export default router;
