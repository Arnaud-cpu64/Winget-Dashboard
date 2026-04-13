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
- **Authentification LDAP/AD** — accès réservé aux membres du groupe `GAP-Winget` du domaine `ge-pedago`
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
│  Vérification groupe GAP-Winget · session cookie │
└─────────────────────────────────────────────────┘
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

## Authentification LDAP/AD

L'accès au dashboard est protégé par le service `auth-proxy` qui s'authentifie sur le domaine `ge-pedago.etat-ge.ch`.

### Variables d'environnement requises

| Variable | Exemple | Description |
|----------|---------|-------------|
| `SESSION_SECRET` | `openssl rand -hex 32` | Secret de chiffrement des sessions |
| `LDAP_URLS` | `ldap://ECUREUIL.ge-pedago.etat-ge.ch,...` | DCs séparés par des virgules |
| `LDAP_BASE_DN` | `DC=ge-pedago,DC=etat-ge,DC=ch` | Base DN du domaine |
| `LDAP_USER_BASE` | `OU=Utilisateurs,OU=...,DC=ge-pedago,...` | OU contenant les utilisateurs |
| `LDAP_GROUP_DN` | `CN=GAP-Winget,OU=Groupes,DC=ge-pedago,...` | DN complet du groupe d'accès |
| `LDAP_DOMAIN` | `ge-pedago` | Préfixe UPN (utilisateur@ge-pedago) |

> **Important :** `LDAP_USER_BASE` doit correspondre à l'OU réelle de votre AD. Vérifiez-la avec un outil LDAP (ex: Apache Directory Studio) avant le premier déploiement.

### Contrôleurs de domaine disponibles

```
ECUREUIL.ge-pedago.etat-ge.ch
ELEPHANT.ge-pedago.etat-ge.ch
ENARGIA.ge-pedago.etat-ge.ch
ERISTALE.ge-pedago.etat-ge.ch
ESPADON.ge-pedago.etat-ge.ch
EUMENES.ge-pedago.etat-ge.ch
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
                      validation TS            ghcr.io/arnaud-edu-cpu64/
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
git clone git@github.com:arnaud-edu-cpu64/Winget-Dashboard.git
cd Winget-Dashboard

# Ajouter GitLab comme second remote
git remote add gitlab git@git.devops.etat-ge.ch:DEVELOPPEUR-PEDAGO/windows/SEMWinget.git

# Vérifier les deux remotes
git remote -v
# origin  git@github.com:arnaud-edu-cpu64/Winget-Dashboard.git  (fetch/push)
# gitlab  git@git.devops.etat-ge.ch:...                         (fetch/push)
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
ghcr.io/arnaud-edu-cpu64/wg-repo-api:v1.1.0
ghcr.io/arnaud-edu-cpu64/wg-repo-dashboard:v1.1.0
ghcr.io/arnaud-edu-cpu64/wg-repo-migrator:v1.1.0
ghcr.io/arnaud-edu-cpu64/wg-repo-auth:v1.1.0
```

### Rendre les packages GHCR accessibles aux serveurs

Par défaut les packages GHCR sont privés. Deux options :

**Option A — Rendre les packages publics** (plus simple) :  
Sur github.com → **Packages** → chaque image → **Package settings** → Change visibility → **Public**

**Option B — Authentification sur chaque serveur** :
```bash
# Créer un token GitHub avec le scope read:packages
docker login ghcr.io -u arnaud-edu-cpu64 -p <github-token>
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
git clone git@git.devops.etat-ge.ch:DEVELOPPEUR-PEDAGO/windows/SEMWinget.git /opt/wg-repo
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
LDAP_USER_BASE=OU=Utilisateurs,OU=<votre-OU>,DC=ge-pedago,DC=etat-ge,DC=ch
LDAP_GROUP_DN=CN=GAP-Winget,OU=<votre-OU-groupes>,DC=ge-pedago,DC=etat-ge,DC=ch
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

# Lancer tous les services en HTTP sur le port 80
docker compose -f docker-compose.dev.yml pull
docker compose -f docker-compose.dev.yml up -d
```

Accéder à **http://localhost** — la page de login LDAP s'affiche.

> Le service auth doit pouvoir joindre les DCs LDAP. Si votre machine de dev n'est pas sur le réseau interne, passez `LDAP_URLS` vers un DC accessible via VPN.

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

### Endpoints Winget exposés (sans authentification)

| Méthode | Chemin | Description |
|---------|--------|-------------|
| `GET` | `/winget/information` | Informations API (version, contrats) |
| `POST` | `/winget/packages/search` | Recherche (Query / Filters / Inclusions) |
| `GET` | `/winget/packages` | Liste paginée avec filtres |
| `GET` | `/winget/packages/:id` | Détail d'un paquet |
| `GET` | `/winget/packages/:id/versions` | Toutes les versions |
| `GET` | `/winget/packages/:id/versions/:v` | Version spécifique |
| `GET` | `/winget/packages/:id/versions/:v/manifests` | Manifestes YAML |

---

## Intégration SCCM / MECM

Accessible dans le tableau de bord via **Intégration SCCM**.

### Scripts générés automatiquement

**Script de détection** :
```powershell
$PackageId = "Mozilla.Firefox"
$RepoName  = "eduwinget"
$output = winget list --id $PackageId --source $RepoName --accept-source-agreements 2>$null
if ($output -match [regex]::Escape($PackageId)) { exit 0 } else { exit 1 }
```

**Script d'installation** :
```powershell
winget install --id Mozilla.Firefox --source eduwinget --silent --accept-package-agreements --accept-source-agreements
```

### Export du catalogue

| Format | URL | Description |
|--------|-----|-------------|
| JSON | `GET /api/packages/export?format=json&repo=eduwinget` | Catalogue complet |
| CSV | `GET /api/packages/export?format=csv&repo=eduwinget` | Import Excel / SCCM |
| PowerShell | `GET /api/packages/export?format=powershell&repo=eduwinget` | Script groupé |

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
│   ├── docker-compose.dev.yml   # Environnement dev local (HTTP, sans TLS)
│   ├── docker-compose.prod.yml  # Surcharges PROD
│   ├── docker-compose.rec.yml   # Surcharges REC
│   └── .env.prod.example    # Template de configuration PROD
├── Dockerfile.api           # Image API
├── Dockerfile.auth          # Image Auth Proxy LDAP
├── Dockerfile.dashboard     # Image Dashboard (nginx + statiques)
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
