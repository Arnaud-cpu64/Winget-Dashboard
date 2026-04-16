# WG-Repo — Dépôt Winget Auto-hébergé

Tableau de bord et serveur de paquets Winget auto-hébergé.  
Permet de gérer un catalogue de logiciels internes et de les déployer via **Winget** et **SCCM/MECM**, sans dépendre d'internet.

---

## Fonctionnalités

- **Tableau de bord** — vue d'ensemble du catalogue, détection automatique des mises à jour disponibles
- **Recherche & Ajout** — recherche dans le catalogue, ajout de nouveaux paquets
- **Source Winget native** — compatible avec le protocole REST Winget v1.7 (`winget source add`)
- **Intégration SCCM/MECM** — génération de scripts PowerShell de détection et d'installation
- **Export** — catalogue exportable en CSV, JSON ou script PowerShell groupé
- **Authentification LDAP/AD** — accès réservé aux membres d'un groupe AD configuré
- **Déploiement Docker** — 4 images légères, orchestrées via Docker Compose

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Navigateur (React + Vite)                       │
│  Tableau de bord · Recherche · SCCM             │
└────────────────────┬────────────────────────────┘
                     │ HTTPS
┌────────────────────▼────────────────────────────┐
│  nginx (image dashboard)                         │
│  auth_request → auth:4000/auth/check             │
│  /auth/   →  auth:4000   (login LDAP)           │
│  /api/    →  api:3000    (protégé)               │
│  /winget/ →  api:3000    (public, clients Win)   │
│  /*       →  statiques React (protégé)           │
└────────────────────┬────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────┐
│  Auth Proxy (Node.js)                            │
│  Formulaire de login · validation LDAP/AD        │
│  Vérification groupe AD · session cookie         │
└─────────────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────┐
│  API Express (Node.js)                           │
│  /api/packages        CRUD catalogue             │
│  /api/packages/export Export CSV/JSON/PS1        │
│  /winget/*            Protocole REST Winget v1.7 │
└────────────────────┬────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────┐
│  PostgreSQL 16                                   │
│  packages · package_versions                     │
└─────────────────────────────────────────────────┘
```

---

## Authentification LDAP/AD

L'accès au dashboard est protégé par le service `auth-proxy` qui s'authentifie sur votre domaine Active Directory.

### Variables d'environnement requises

| Variable | Exemple | Description |
|----------|---------|-------------|
| `SESSION_SECRET` | `openssl rand -hex 32` | Secret de chiffrement des sessions |
| `LDAP_URLS` | `ldaps://DC01.exemple.com,ldaps://DC02.exemple.com` | DCs séparés par des virgules |
| `LDAP_BASE_DN` | `DC=exemple,DC=com` | Base DN du domaine |
| `LDAP_USER_BASE` | `OU=Utilisateurs,DC=exemple,DC=com` | OU contenant les utilisateurs |
| `LDAP_GROUP_DN` | `CN=GRP-Winget,OU=Groupes,DC=exemple,DC=com` | DN complet du groupe d'accès |
| `LDAP_DOMAIN` | `exemple` | Préfixe UPN (utilisateur@exemple.com) |

> **Important :** `LDAP_USER_BASE` doit correspondre à l'OU réelle de votre AD. Vérifiez-la avec un outil LDAP (ex: Apache Directory Studio) avant le premier déploiement.

### Exemple — contrôleurs de domaine

```
DC01.exemple.com
DC02.exemple.com
DC03.exemple.com
```

---

## CI/CD — Workflow complet

### Schéma des flux

```
  [Replit]  ──push──►  [GitHub]  ──tag vX.Y.Z──►  [GitHub Actions]
                           │                               │
                       git pull                    Build 4 images Docker
                       git push                           │
                           │                              ▼
                      [GitLab interne]        [GHCR — ghcr.io]
                      validation TS            ghcr.io/<utilisateur>/
                                              wg-repo-api
                                              wg-repo-dashboard
                                              wg-repo-migrator
                                              wg-repo-auth
                                                           │
                                                   docker compose pull
                                                           │
                                              ┌────────────────────────┐
                                              │  Serveurs RHEL9         │
                                              │  PROD / REC             │
                                              │  (accès GHCR ouvert)    │
                                              └────────────────────────┘
```

**Votre poste fait le relais** entre GitHub (internet) et GitLab (intranet).  
Les images Docker sont construites par GitHub Actions et publiées sur GHCR.  
Les serveurs RHEL9 tirent les images depuis GHCR (accès réseau à ouvrir vers `ghcr.io`).

---

### Mise en place initiale (une seule fois sur votre poste)

```bash
# Cloner depuis GitHub (si pas encore fait)
git clone git@github.com:<utilisateur>/Winget-Dashboard.git
cd Winget-Dashboard

# Ajouter GitLab comme second remote
git remote add gitlab git@gitlab.exemple.com:<groupe>/SEMWinget.git

# Vérifier les deux remotes
git remote -v
# origin  git@github.com:<utilisateur>/Winget-Dashboard.git  (fetch/push)
# gitlab  git@gitlab.exemple.com:<groupe>/SEMWinget.git      (fetch/push)
```

### Workflow de publication d'une nouvelle version

```bash
# 1. Récupérer les dernières modifications depuis GitHub
git pull origin main

# 2. Pousser vers GitLab (déclenche la validation TypeScript)
git push gitlab main

# 3. Créer un tag → déclenche GitHub Actions qui construit et publie les images Docker
git tag v1.1.0
git push origin v1.1.0
```

GitHub Actions construit les 4 images et les publie sur **GitHub Container Registry (GHCR)** :
```
ghcr.io/<utilisateur>/wg-repo-api:v1.1.0
ghcr.io/<utilisateur>/wg-repo-dashboard:v1.1.0
ghcr.io/<utilisateur>/wg-repo-migrator:v1.1.0
ghcr.io/<utilisateur>/wg-repo-auth:v1.1.0
```

### Rendre les packages GHCR accessibles aux serveurs

Par défaut les packages GHCR sont privés. Deux options :

**Option A — Rendre les packages publics** (plus simple) :  
Sur github.com → **Packages** → chaque image → **Package settings** → Change visibility → **Public**

**Option B — Authentification sur chaque serveur** :
```bash
# Créer un token GitHub avec le scope read:packages
docker login ghcr.io -u <utilisateur-github> -p <github-token>
```

---

## Déploiement (Docker)

### Prérequis

- Docker CE + plugin Compose (voir [Installation Docker sur RHEL9](#installation-docker-rhel9))
- Accès SSH au dépôt GitLab interne
- Certificats TLS émis par l'autorité de certification interne
- Accès réseau vers les contrôleurs de domaine LDAP

### 1. Préparer les certificats TLS

```bash
sudo mkdir -p /opt/wg-repo/certs
sudo chmod 700 /opt/wg-repo/certs

# cert.pem — certificat serveur + chaîne intermédiaire complète (fullchain)
# key.pem  — clé privée (sans mot de passe)
sudo cp /chemin/vers/fullchain.pem /opt/wg-repo/certs/cert.pem
sudo cp /chemin/vers/private.key   /opt/wg-repo/certs/key.pem
sudo chmod 600 /opt/wg-repo/certs/key.pem
```

> `cert.pem` doit contenir le certificat serveur **suivi** des certificats intermédiaires de l'AC interne (fullchain). Sans la chaîne complète, Windows refusera de faire confiance à la source Winget.

### 2. Cloner le dépôt sur le serveur

```bash
git clone git@gitlab.exemple.com:<groupe>/SEMWinget.git /opt/wg-repo
```

### 3. Configuration

```bash
cd /opt/wg-repo/deploy
cp .env.prod.example .env.prod
```

Remplir `.env.prod` (variables obligatoires) :

```env
POSTGRES_PASSWORD=mot-de-passe-fort
CERTS_DIR=/opt/wg-repo/certs
SESSION_SECRET=<résultat de : openssl rand -hex 32>
LDAP_URLS=ldaps://DC01.exemple.com,ldaps://DC02.exemple.com
LDAP_BASE_DN=DC=exemple,DC=com
LDAP_USER_BASE=OU=Utilisateurs,DC=exemple,DC=com
LDAP_GROUP_DN=CN=GRP-Winget,OU=Groupes,DC=exemple,DC=com
LDAP_DOMAIN=exemple
```

### 4. Démarrage

**Environnement PROD :**
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.prod pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.prod up -d
```

**Environnement REC :**
```bash
docker compose -f docker-compose.yml -f docker-compose.rec.yml --env-file .env.rec pull
docker compose -f docker-compose.yml -f docker-compose.rec.yml --env-file .env.rec up -d
```

### 5. Vérification

```bash
docker compose ps
# Vérifier la redirection HTTP → HTTPS
curl -I http://localhost
# Vérifier l'API (k = ignore erreur cert si l'AC interne n'est pas dans le trust store local)
curl -k https://localhost/api/packages
```

---

## Développement local (sans TLS)

Pour tester sur une machine de dev sans certificats TLS :

```bash
cd deploy

# Première fois (ou après modification de nginx.dev.conf) :
# construit une image dashboard locale avec la config HTTP
docker compose -f docker-compose.dev.yml build dashboard

# Tirer les autres images et démarrer tous les services
docker compose -f docker-compose.dev.yml pull api auth migrate
docker compose -f docker-compose.dev.yml up -d
```

Accéder à **http://localhost** — la page de login LDAP s'affiche.

> Le service auth doit pouvoir joindre les DCs LDAP. Si votre machine de dev n'est pas sur le réseau interne, passez `LDAP_URLS` vers un DC accessible via VPN.

> **Windows / Docker Desktop** : le dashboard est construit localement via `Dockerfile.dashboard.dev` pour éviter les problèmes de montage de fichier depuis un chemin réseau.

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

Ce serveur implémente le protocole **Microsoft.Rest** (Winget REST API v1.7).

### Enregistrer la source sur un poste Windows

**Production :**
```powershell
winget source add --name "monrepo" --arg https://winget.exemple.com/winget --type "Microsoft.Rest"
```

**Recette :**
```powershell
winget source add --name "monrepo-rec" --arg https://winget-rec.exemple.com/winget --type "Microsoft.Rest"
```

Vérification :
```powershell
winget source list
```

### Commandes winget compatibles avec la source

| Commande | Exemple | Description |
|----------|---------|-------------|
| `install` | `winget install --id Mozilla.Firefox --source monrepo` | Installe l'application spécifiée |
| `show` | `winget show --id Mozilla.Firefox --source monrepo` | Affiche les détails de l'application |
| `search` | `winget search firefox --source monrepo` | Recherche une application dans le dépôt |
| `list` | `winget list --source monrepo` | Affiche les packages installés provenant du dépôt |
| `upgrade` | `winget upgrade --id Mozilla.Firefox --source monrepo` | Met à niveau l'application spécifiée |
| `upgrade --all` | `winget upgrade --source monrepo --all` | Met à niveau tous les packages du dépôt |
| `uninstall` | `winget uninstall --id Mozilla.Firefox --source monrepo` | Désinstalle l'application spécifiée |
| `download` | `winget download --id Mozilla.Firefox --source monrepo` | Télécharge le programme d'installation |
| `source` | `winget source update monrepo` | Met à jour le cache local du dépôt |
| `hash` | `winget hash ./setup.exe` | Génère le SHA256 pour un programme d'installation |
| `export` | `winget export -o packages.json --source monrepo` | Exporte la liste des packages installés |
| `import` | `winget import -i packages.json` | Installe tous les packages d'un fichier exporté |

> Les commandes `validate`, `configure`, `pin`, `features`, `repair` et `dscv3` ne dépendent pas de la source et fonctionnent indépendamment du dépôt.

### Endpoints Winget exposés (sans authentification)

| Méthode | Chemin | Description |
|---------|--------|-------------|
| `GET` | `/winget/information` | Informations API (version, contrats) |
| `POST` | `/winget/manifestSearch` | Recherche (Query / Filters / Inclusions) |
| `GET` | `/winget/packageManifests/:id` | Manifestes de toutes les versions |
| `GET` | `/winget/packageManifests/:id/:version` | Manifestes d'une version spécifique |

---

## Intégration SCCM / MECM

Accessible dans le tableau de bord via **Intégration SCCM**.

### Scripts générés automatiquement

**Script de détection** :
```powershell
$PackageId = "Mozilla.Firefox"
$RepoName  = "monrepo"
$output = winget list --id $PackageId --source $RepoName --accept-source-agreements 2>$null
if ($output -match [regex]::Escape($PackageId)) { exit 0 } else { exit 1 }
```

**Script d'installation** :
```powershell
winget install --id Mozilla.Firefox --source monrepo --silent --accept-package-agreements --accept-source-agreements
```

### Export du catalogue

| Format | URL | Description |
|--------|-----|-------------|
| JSON | `GET /api/packages/export?format=json&repo=monrepo` | Catalogue complet |
| CSV | `GET /api/packages/export?format=csv&repo=monrepo` | Import Excel / SCCM |
| PowerShell | `GET /api/packages/export?format=powershell&repo=monrepo` | Script groupé |

---

## API REST interne

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

## Structure du projet

```
.
├── artifacts/
│   ├── api-server/          # Serveur Express (Node.js + TypeScript)
│   ├── auth-proxy/          # Service auth LDAP/AD (Node.js + ldapts)
│   └── winget-dashboard/    # Frontend React + Vite (interface française)
├── lib/
│   ├── db/                  # Schéma PostgreSQL (Drizzle ORM)
│   ├── api-spec/            # Spécification OpenAPI
│   ├── api-client-react/    # Client API généré (React Query)
│   └── api-zod/             # Schémas Zod générés
├── deploy/
│   ├── nginx.conf           # Config nginx PROD (TLS + auth_request)
│   ├── nginx.dev.conf       # Config nginx DEV (HTTP uniquement)
│   ├── docker-compose.yml       # Configuration de base
│   ├── docker-compose.dev.yml      # Environnement dev local (HTTP, sans TLS)
│   ├── docker-compose.prod.yml     # Surcharges PROD
│   ├── docker-compose.rec.yml      # Surcharges REC
│   ├── Dockerfile.dashboard.dev    # Image dashboard dev (HTTP, sans TLS)
│   └── .env.prod.example           # Template de configuration PROD
├── Dockerfile.api           # Image API
├── Dockerfile.auth          # Image Auth Proxy LDAP
├── Dockerfile.dashboard     # Image Dashboard (nginx + statiques + TLS)
├── Dockerfile.migrator      # Image migration Drizzle (run-once)
├── .gitlab-ci.yml           # Pipeline GitLab CI (validation TypeScript)
└── .github/workflows/
    └── release.yml          # Build & Push 4 images Docker → GHCR
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
