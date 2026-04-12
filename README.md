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

## CI/CD — Workflow complet

### Schéma des flux

```
  [Replit / développeur externe]
           │
           │  git push (GitHub public)
           ▼
  ┌─────────────────────┐
  │  GitHub              │  ← sauvegarde / collaboration externe
  │  Arnaud-cpu64/       │
  │  WG-SelfRepo         │
  └─────────────────────┘
           │
           │  git pull  (depuis le poste interne)
           │  git push  (vers GitLab interne)
           ▼
  ┌─────────────────────┐          ┌──────────────────────────────┐
  │  GitLab interne      │ CI/CD ──►│  Registre Docker GitLab      │
  │  git.devops.         │          │  registry.devops.etat-ge.ch  │
  │  etat-ge.ch          │          └──────────────────────────────┘
  └─────────────────────┘                        │
                                                 │  docker compose pull
                                                 ▼
                                    ┌────────────────────────┐
                                    │  Serveurs RHEL9         │
                                    │  PROD / REC             │
                                    └────────────────────────┘
```

**Votre poste interne fait le relais** : il a accès à GitHub (internet) et à GitLab (intranet). Les serveurs RHEL9 n'ont accès qu'au GitLab interne.

---

### Mise en place initiale (une seule fois sur votre poste)

```bash
# Cloner depuis GitHub (si pas encore fait)
git clone https://github.com/Arnaud-cpu64/WG-SelfRepo.git
cd WG-SelfRepo

# Ajouter GitLab comme second remote
git remote add gitlab git@git.devops.etat-ge.ch:DEVELOPPEUR-PEDAGO/windows/SEMWinget.git

# Vérifier les deux remotes
git remote -v
# origin  https://github.com/Arnaud-cpu64/WG-SelfRepo.git  (fetch/push)
# gitlab  git@git.devops.etat-ge.ch:...                    (fetch/push)
```

### Workflow de publication d'une nouvelle version

```bash
# 1. Récupérer les dernières modifications depuis GitHub
git pull origin main

# 2. Pousser vers GitLab pour déclencher le CI
git push gitlab main

# 3. Créer un tag versionné → déclenche le build des images Docker
git tag v1.0.0
git push gitlab v1.0.0
```

GitLab CI lance 3 jobs en parallèle (`build-api`, `build-dashboard`, `build-migrator`) et pousse les images dans :
```
registry.devops.etat-ge.ch/DEVELOPPEUR-PEDAGO/windows/SEMWinget/wg-repo-api:v1.0.0
registry.devops.etat-ge.ch/DEVELOPPEUR-PEDAGO/windows/SEMWinget/wg-repo-dashboard:v1.0.0
registry.devops.etat-ge.ch/DEVELOPPEUR-PEDAGO/windows/SEMWinget/wg-repo-migrator:v1.0.0
```

> **Hostname du registre :** vérifiez l'URL exacte dans GitLab → **Settings → Packages and registries → Container registry**. GitLab y affiche aussi la commande `docker login` prête à l'emploi.

### Activer le registre de conteneurs GitLab

GitLab → Settings → General → Visibility → Container registry → **Enabled**

### Déploiement sur les serveurs RHEL9

Une fois le build CI terminé, depuis chaque serveur :

```bash
# Se connecter au registre GitLab (une seule fois, ou après expiration du token)
docker login registry.devops.etat-ge.ch -u <utilisateur> -p <token-accès-personnel>

# Mettre à jour les images et redémarrer les conteneurs
cd /opt/wg-repo/deploy
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.prod pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.prod up -d
```

> Créer un **Personal Access Token** GitLab sous **User Settings → Access Tokens** avec le scope `read_registry`.

---

## Déploiement rapide (Docker)

### Prérequis

- Docker CE + plugin Compose (voir [Installation Docker sur RHEL9](#installation-docker-rhel9))
- Accès au registre Docker GitLab interne
- Certificats TLS émis par l'autorité de certification interne

### 1. Préparer les certificats TLS

Créer le dossier de certificats sur chaque serveur et y déposer les fichiers :

```bash
sudo mkdir -p /opt/wg-repo/certs
sudo chmod 700 /opt/wg-repo/certs

# Copier les fichiers depuis votre PKI :
#   cert.pem — certificat du serveur + chaîne intermédiaire complète (fullchain)
#   key.pem  — clé privée (sans mot de passe)
sudo cp /chemin/vers/fullchain.pem /opt/wg-repo/certs/cert.pem
sudo cp /chemin/vers/private.key   /opt/wg-repo/certs/key.pem
sudo chmod 600 /opt/wg-repo/certs/key.pem
```

> **Important :** `cert.pem` doit contenir le certificat du serveur **suivi** des certificats intermédiaires de l'AC interne, concaténés dans l'ordre (du plus spécifique au plus général). Sans la chaîne complète, Windows refusera de faire confiance à la source Winget.

### 2. Connexion au registre GitLab

```bash
docker login registry.devops.etat-ge.ch -u <utilisateur> -p <token-accès-personnel>
```

### 3. Configuration

```bash
cd deploy/
cp .env.prod.example .env.prod    # pour la PROD
cp .env.rec.example  .env.rec     # pour la REC
```

Remplir `.env.prod` (les valeurs à adapter) :

```env
REGISTRY=registry.gitlab.interne/groupe/wg-selfRepo
TAG=v1.0.0
POSTGRES_PASSWORD=mot-de-passe-fort
CERTS_DIR=/opt/wg-repo/certs
```

> `CERTS_DIR` doit pointer vers le dossier préparé à l'étape 1.

### 4. Démarrage

**Environnement PROD** (ports 80 → redirige HTTPS et 443 → TLS) :
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.prod up -d
```

**Environnement REC** (redémarrage souple, port 8080) :
```bash
docker compose -f docker-compose.yml -f docker-compose.rec.yml --env-file .env.rec up -d
```

La migration de base de données s'applique automatiquement au premier démarrage.

### 5. Vérification

```bash
docker compose ps
# Vérifier la redirection HTTP → HTTPS
curl -I http://localhost
# Vérifier l'API via HTTPS (k = ignore erreur cert si l'AC interne n'est pas dans le trust store)
curl -k https://localhost/api/packages
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

**Production :**
```powershell
winget source add --name "eduwinget" --arg https://eduwinget.ceti.etat-ge.ch/winget --type "Microsoft.Rest"
```

**Recette :**
```powershell
winget source add --name "eduwinget-rec" --arg https://eduwinget.rec.etat-ge.ch/winget --type "Microsoft.Rest"
```

Vérification :
```powershell
winget source list
```

### Installer un paquet depuis la source

```powershell
winget install --id Mozilla.Firefox --source eduwinget
winget upgrade --source eduwinget --all
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

Pour chaque paquet, deux scripts PowerShell sont générés (nom de source configurable dans l'interface) :

**Script de détection** — renvoie `0` si le paquet est installé (et à la bonne version), `1` sinon :

```powershell
# Coller dans : SCCM → Déploiements → Type de déploiement → Méthode de détection
$PackageId = "Mozilla.Firefox"
$RepoName  = "eduwinget"
$output = winget list --id $PackageId --source $RepoName --accept-source-agreements 2>$null
if ($output -match [regex]::Escape($PackageId)) { exit 0 } else { exit 1 }
```

**Script d'installation** — installe silencieusement via Winget :

```powershell
# Coller dans : SCCM → Déploiements → Type de déploiement → Programme d'installation
winget install --id Mozilla.Firefox --source eduwinget --silent --accept-package-agreements --accept-source-agreements
```

> Le nom de source (`eduwinget`) doit correspondre à celui utilisé lors du `winget source add` sur les postes clients.

### Export du catalogue

| Format | URL | Description |
|--------|-----|-------------|
| JSON | `GET /api/packages/export?format=json&repo=eduwinget` | Catalogue complet en JSON |
| CSV | `GET /api/packages/export?format=csv&repo=eduwinget` | Import Excel / SCCM |
| PowerShell | `GET /api/packages/export?format=powershell&repo=eduwinget` | Script d'installation groupé |

Scripts par paquet :

```
GET /api/packages/sccm-scripts?ids=1,2,3&repo=eduwinget
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
