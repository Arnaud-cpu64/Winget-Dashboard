# WG-Repo — Dépôt Winget Auto-hébergé

Tableau de bord et serveur de paquets Winget auto-hébergé.  
Permet de gérer un catalogue de logiciels internes et de les déployer via **Winget** et **SCCM/MECM**, sans dépendre d'internet.

---

## Fonctionnalités

- **Tableau de bord** — vue d'ensemble du catalogue, détection automatique des mises à jour disponibles
- **Recherche & Ajout** — recherche dans le catalogue, ajout de nouveaux paquets
- **Source Winget native** — compatible avec le protocole REST Winget v1.1 (`winget source add`)
- **Intégration SCCM/MECM** — génération de scripts PowerShell de détection et d'installation
- **Export** — catalogue exportable en CSV, JSON ou script PowerShell groupé
- **Déploiement Docker** — 3 images légères, orchestrées via Docker Compose

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Navigateur (React + Vite)                       │
│  Tableau de bord · Recherche · SCCM             │
└────────────────────┬────────────────────────────┘
                     │ HTTPS
┌────────────────────▼────────────────────────────┐
│  nginx                                           │
│  /api/  →  api:3000                             │
│  /*     →  fichiers statiques React              │
└────────────────────┬────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────┐
│  API Express (Node.js)                           │
│  /api/packages        CRUD catalogue             │
│  /api/packages/export Export CSV/JSON/PS1        │
│  /winget/*            Protocole REST Winget v1.1 │
└────────────────────┬────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────┐
│  PostgreSQL 16                                   │
│  packages · package_versions                     │
└─────────────────────────────────────────────────┘
```

---

## CI/CD avec GitLab interne

Le fichier `.gitlab-ci.yml` à la racine configure automatiquement la construction et la publication des images Docker vers le registre GitLab interne.

### Prérequis GitLab

1. **Activer le registre de conteneurs** sur le projet :  
   GitLab → Settings → General → Visibility → Container registry → Enabled

2. **Pousser le code** vers votre GitLab interne :
   ```bash
   git remote add gitlab https://gitlab.interne/groupe/wg-selfRepo.git
   git push gitlab main
   ```

3. **Créer un tag** pour déclencher le build :
   ```bash
   git tag v1.0.0
   git push gitlab v1.0.0
   ```

GitLab CI lance 3 jobs en parallèle (`build-api`, `build-dashboard`, `build-migrator`) et pousse les images dans :
```
registry.gitlab.interne/groupe/wg-selfRepo/wg-repo-api:v1.0.0
registry.gitlab.interne/groupe/wg-selfRepo/wg-repo-dashboard:v1.0.0
registry.gitlab.interne/groupe/wg-selfRepo/wg-repo-migrator:v1.0.0
```

### Connexion au registre depuis les serveurs RHEL9

```bash
docker login registry.gitlab.interne -u <utilisateur> -p <token-accès-personnel>
```

---

## Déploiement rapide (Docker)

### Prérequis

- Docker CE + plugin Compose (voir [Installation Docker sur RHEL9](#installation-docker-rhel9))
- Accès à `ghcr.io` (GitHub Container Registry)

### 1. Connexion au registre

```bash
docker login ghcr.io -u <votre-login-github> -p <votre-PAT>
```

> Le PAT doit avoir le scope `read:packages`.

### 2. Configuration

```bash
cd deploy/
cp .env.example .env.prod
```

Remplir `.env.prod` :

```env
# Registre GitLab interne
REGISTRY=registry.gitlab.interne/groupe/wg-selfRepo
TAG=v1.0.0
POSTGRES_PASSWORD=mot-de-passe-fort
HTTP_PORT=80
```

### 3. Démarrage

**Environnement PROD** (redémarrage automatique, port 80) :
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.prod up -d
```

**Environnement REC** (redémarrage souple, port 8080) :
```bash
docker compose -f docker-compose.yml -f docker-compose.rec.yml --env-file .env.rec up -d
```

La migration de base de données s'applique automatiquement au premier démarrage.

### 4. Vérification

```bash
docker compose ps
curl http://localhost/api/packages
```

---

## Installation Docker (RHEL9)

```bash
sudo dnf config-manager --add-repo https://download.docker.com/linux/rhel/docker-ce.repo
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
newgrp docker
```

---

## Intégration Winget

Ce serveur implémente le protocole **Microsoft.Rest** (Winget REST API v1.1).

### Enregistrer la source sur un poste Windows

```powershell
winget source add --name "MonDépôt" --arg https://<hôte>/winget --type "Microsoft.Rest"
winget source list
```

### Installer un paquet depuis la source

```powershell
winget install --id Mozilla.Firefox --source MonDépôt
winget upgrade --source MonDépôt --all
```

### Endpoints Winget exposés

| Méthode | Chemin | Description |
|---------|--------|-------------|
| `GET` | `/winget/information` | Informations API (version, contrats) |
| `POST` | `/winget/packages/search` | Recherche (Query / Filters / Inclusions) |
| `GET` | `/winget/packages` | Liste paginée avec filtres |
| `GET` | `/winget/packages/:id` | Détail d'un paquet |
| `GET` | `/winget/packages/:id/versions` | Toutes les versions |
| `GET` | `/winget/packages/:id/versions/:v` | Version spécifique |
| `GET` | `/winget/packages/:id/versions/:v/manifests` | Manifestes YAML (version, locale, installer) |

---

## Intégration SCCM / MECM

Accessible dans le tableau de bord via **Intégration SCCM**.

### Scripts générés automatiquement

Pour chaque paquet, deux scripts PowerShell sont générés :

**Script de détection** — renvoie `0` si le paquet est installé (et à la bonne version), `1` sinon :

```powershell
# Coller dans : SCCM → Déploiements → Type de déploiement → Méthode de détection
$PackageId = "Mozilla.Firefox"
$RepoName  = "MonDépôt"
$output = winget list --id $PackageId --source $RepoName --accept-source-agreements 2>$null
if ($output -match [regex]::Escape($PackageId)) { exit 0 } else { exit 1 }
```

**Script d'installation** — installe silencieusement via Winget :

```powershell
# Coller dans : SCCM → Déploiements → Type de déploiement → Programme d'installation
winget install --id Mozilla.Firefox --source MonDépôt --silent --accept-package-agreements --accept-source-agreements
```

### Export du catalogue

| Format | URL | Description |
|--------|-----|-------------|
| JSON | `GET /api/packages/export?format=json&repo=MonDépôt` | Catalogue complet en JSON |
| CSV | `GET /api/packages/export?format=csv&repo=MonDépôt` | Import Excel / SCCM |
| PowerShell | `GET /api/packages/export?format=powershell&repo=MonDépôt` | Script d'installation groupé |

Scripts par paquet :

```
GET /api/packages/sccm-scripts?ids=1,2,3&repo=MonDépôt
```

---

## API REST interne

### Packages

| Méthode | Chemin | Description |
|---------|--------|-------------|
| `GET` | `/api/packages` | Lister tous les paquets |
| `POST` | `/api/packages` | Ajouter un paquet |
| `GET` | `/api/packages/:id` | Détail d'un paquet |
| `PUT` | `/api/packages/:id` | Modifier un paquet |
| `DELETE` | `/api/packages/:id` | Supprimer un paquet |
| `GET` | `/api/packages/export` | Exporter (csv / json / powershell) |
| `GET` | `/api/packages/sccm-scripts` | Scripts SCCM pour une sélection |

---

## Publication d'une nouvelle version

### Via GitLab CI (recommandé — registre interne)

```bash
git tag v1.2.0
git push origin v1.2.0
```

GitLab CI construit automatiquement les 3 images et les pousse dans le registre interne.  
Suivre l'avancement dans **GitLab → CI/CD → Pipelines**.

Sur le serveur, mettre à jour `TAG=v1.2.0` dans `.env.prod` puis :

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.prod pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.prod up -d
```

### Via GitHub Actions (si accès internet disponible)

```bash
git tag v1.2.0
git push origin v1.2.0   # déclenche le workflow .github/workflows/release.yml
```

---

## Structure du projet

```
.
├── artifacts/
│   ├── api-server/          # Serveur Express (Node.js + TypeScript)
│   └── winget-dashboard/    # Frontend React + Vite (interface française)
├── lib/
│   ├── db/                  # Schéma PostgreSQL (Drizzle ORM)
│   ├── api-spec/            # Spécification OpenAPI
│   ├── api-client-react/    # Client API généré (React Query)
│   └── api-zod/             # Schémas Zod générés
├── deploy/
│   ├── nginx.conf           # Reverse proxy nginx
│   ├── docker-compose.yml   # Configuration de base
│   ├── docker-compose.prod.yml  # Surcharges PROD
│   ├── docker-compose.rec.yml   # Surcharges REC
│   └── .env.example         # Template de configuration
├── Dockerfile.api           # Image API (esbuild bundle, ~60 Mo)
├── Dockerfile.dashboard     # Image Dashboard (nginx + statiques, ~30 Mo)
├── Dockerfile.migrator      # Image migration Drizzle (run-once)
├── .gitlab-ci.yml           # Pipeline GitLab CI (build → registre interne)
└── .github/workflows/
    └── release.yml          # Build & Push GHCR (si accès internet)
```

---

## Développement (Replit)

```bash
pnpm install
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/winget-dashboard run dev
```

Régénérer le client API après modification de `lib/api-spec/openapi.yaml` :

```bash
pnpm --filter @workspace/api-client-react run generate
# Vérifier lib/api-zod/src/index.ts : ne doit contenir que :
# export * from "./generated/api"
```

---

## Licence

Usage interne — non distribué.
