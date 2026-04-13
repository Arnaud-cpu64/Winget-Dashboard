import express from "express";
import session from "express-session";
import ldap from "ldapjs";
import { createServer } from "http";

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ---------------------------------------------------------------
// Configuration — via variables d'environnement
// ---------------------------------------------------------------
const PORT = parseInt(process.env.PORT ?? "4000", 10);
const SESSION_SECRET = process.env.SESSION_SECRET ?? "changez-ce-secret-en-production";
const LDAP_URLS = (process.env.LDAP_URLS ?? "ldap://ECUREUIL.ge-pedago.etat-ge.ch")
  .split(",")
  .map((u) => u.trim());
const LDAP_BASE_DN = process.env.LDAP_BASE_DN ?? "DC=ge-pedago,DC=etat-ge,DC=ch";
const LDAP_USER_BASE = process.env.LDAP_USER_BASE ?? `OU=Utilisateurs,${LDAP_BASE_DN}`;
const LDAP_GROUP_DN = process.env.LDAP_GROUP_DN ?? `CN=GAP-Winget,OU=Groupes,${LDAP_BASE_DN}`;
const LDAP_DOMAIN = process.env.LDAP_DOMAIN ?? "ge-pedago";
const UPSTREAM_URL = process.env.UPSTREAM_URL ?? "http://localhost:3001";
const SESSION_MAX_AGE = parseInt(process.env.SESSION_MAX_AGE_HOURS ?? "8", 10) * 60 * 60 * 1000;

// ---------------------------------------------------------------
// Session
// ---------------------------------------------------------------
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false, // TLS terminé en amont par nginx
      maxAge: SESSION_MAX_AGE,
    },
  })
);

// ---------------------------------------------------------------
// Helpers LDAP
// ---------------------------------------------------------------
function createLdapClient(): ldap.Client {
  // Essayer les DCs dans l'ordre, utiliser le premier qui répond
  const url = LDAP_URLS[Math.floor(Math.random() * LDAP_URLS.length)];
  return ldap.createClient({
    url,
    timeout: 5000,
    connectTimeout: 5000,
    tlsOptions: { rejectUnauthorized: false }, // AC interne auto-signée
  });
}

async function ldapAuthenticate(username: string, password: string): Promise<boolean> {
  return new Promise((resolve) => {
    // UPN : utilisateur@domaine
    const userDN = `${username}@${LDAP_DOMAIN}`;
    const client = createLdapClient();

    client.on("error", () => resolve(false));

    client.bind(userDN, password, (err) => {
      if (err) {
        client.destroy();
        resolve(false);
        return;
      }
      client.unbind();
      resolve(true);
    });
  });
}

async function ldapCheckGroup(username: string, bindPassword: string): Promise<boolean> {
  return new Promise((resolve) => {
    const userDN = `${username}@${LDAP_DOMAIN}`;
    const client = createLdapClient();

    client.on("error", () => resolve(false));

    client.bind(userDN, bindPassword, (bindErr) => {
      if (bindErr) {
        client.destroy();
        resolve(false);
        return;
      }

      const opts: ldap.SearchOptions = {
        filter: `(&(objectClass=user)(sAMAccountName=${username})(memberOf=${LDAP_GROUP_DN}))`,
        scope: "sub",
        attributes: ["sAMAccountName", "displayName"],
        timeLimit: 5,
        sizeLimit: 1,
      };

      client.search(LDAP_USER_BASE, opts, (searchErr, res) => {
        if (searchErr) {
          client.unbind();
          resolve(false);
          return;
        }

        let found = false;
        let displayName = "";

        res.on("searchEntry", (entry) => {
          found = true;
          const dn = entry.attributes.find((a) => a.type === "displayName");
          displayName = dn ? String(dn.values[0]) : username;
        });

        res.on("end", () => {
          client.unbind();
          resolve(found);
        });

        res.on("error", () => {
          client.unbind();
          resolve(false);
        });
      });
    });
  });
}

async function ldapGetDisplayName(username: string, password: string): Promise<string> {
  return new Promise((resolve) => {
    const userDN = `${username}@${LDAP_DOMAIN}`;
    const client = createLdapClient();

    client.on("error", () => resolve(username));

    client.bind(userDN, password, (bindErr) => {
      if (bindErr) { client.destroy(); resolve(username); return; }

      const opts: ldap.SearchOptions = {
        filter: `(sAMAccountName=${username})`,
        scope: "sub",
        attributes: ["displayName"],
        sizeLimit: 1,
      };

      client.search(LDAP_USER_BASE, opts, (err, res) => {
        if (err) { client.unbind(); resolve(username); return; }
        let name = username;
        res.on("searchEntry", (e) => {
          const attr = e.attributes.find((a) => a.type === "displayName");
          if (attr) name = String(attr.values[0]);
        });
        res.on("end", () => { client.unbind(); resolve(name); });
        res.on("error", () => { client.unbind(); resolve(username); });
      });
    });
  });
}

// ---------------------------------------------------------------
// Page de login HTML
// ---------------------------------------------------------------
function loginPage(error?: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Winget Dashboard — Connexion</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0f172a;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 2.5rem;
      width: 100%;
      max-width: 380px;
      box-shadow: 0 25px 50px rgba(0,0,0,.5);
    }
    .logo {
      display: flex;
      align-items: center;
      gap: .75rem;
      margin-bottom: 2rem;
    }
    .logo svg { color: #3b82f6; }
    .logo-text { font-size: 1.1rem; font-weight: 600; color: #f1f5f9; }
    .logo-sub { font-size: .75rem; color: #64748b; }
    h1 { font-size: 1.25rem; font-weight: 600; color: #f1f5f9; margin-bottom: .5rem; }
    p.sub { font-size: .875rem; color: #94a3b8; margin-bottom: 1.5rem; }
    label { display: block; font-size: .8rem; font-weight: 500; color: #94a3b8; margin-bottom: .4rem; }
    input {
      width: 100%;
      padding: .6rem .75rem;
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 6px;
      color: #f1f5f9;
      font-size: .9rem;
      margin-bottom: 1rem;
      outline: none;
      transition: border-color .15s;
    }
    input:focus { border-color: #3b82f6; }
    button {
      width: 100%;
      padding: .7rem;
      background: #3b82f6;
      color: #fff;
      border: none;
      border-radius: 6px;
      font-size: .9rem;
      font-weight: 500;
      cursor: pointer;
      transition: background .15s;
    }
    button:hover { background: #2563eb; }
    .error {
      background: #450a0a;
      border: 1px solid #7f1d1d;
      color: #fca5a5;
      border-radius: 6px;
      padding: .6rem .75rem;
      font-size: .85rem;
      margin-bottom: 1rem;
    }
    .info {
      font-size: .75rem;
      color: #475569;
      text-align: center;
      margin-top: 1.5rem;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
      </svg>
      <div>
        <div class="logo-text">Winget Dashboard</div>
        <div class="logo-sub">GE-PEDAGO</div>
      </div>
    </div>
    <h1>Connexion</h1>
    <p class="sub">Utilisez vos identifiants du domaine <strong style="color:#f1f5f9">GE-PEDAGO</strong></p>
    ${error ? `<div class="error">${error}</div>` : ""}
    <form method="POST" action="/auth/login">
      <label for="username">Nom d'utilisateur</label>
      <input id="username" name="username" type="text" placeholder="prenom.nom" autocomplete="username" required autofocus />
      <label for="password">Mot de passe</label>
      <input id="password" name="password" type="password" placeholder="••••••••" autocomplete="current-password" required />
      <button type="submit">Se connecter</button>
    </form>
    <p class="info">Accès réservé aux membres du groupe <strong>GAP-Winget</strong></p>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------
// Routes auth
// ---------------------------------------------------------------
app.get("/auth/login", (_req, res) => {
  res.send(loginPage());
});

app.post("/auth/login", async (req, res) => {
  const { username, password } = req.body as { username: string; password: string };

  if (!username || !password) {
    res.send(loginPage("Veuillez saisir votre nom d'utilisateur et mot de passe."));
    return;
  }

  try {
    const authenticated = await ldapAuthenticate(username, password);
    if (!authenticated) {
      res.send(loginPage("Identifiants incorrects. Vérifiez votre nom d'utilisateur et mot de passe."));
      return;
    }

    const inGroup = await ldapCheckGroup(username, password);
    if (!inGroup) {
      res.send(loginPage("Accès refusé. Vous n'êtes pas membre du groupe <strong>GAP-Winget</strong>."));
      return;
    }

    const displayName = await ldapGetDisplayName(username, password);

    (req.session as any).user = { username, displayName };
    req.session.save(() => {
      const redirect = (req.session as any).returnTo ?? "/";
      delete (req.session as any).returnTo;
      res.redirect(redirect);
    });
  } catch {
    res.send(loginPage("Erreur de connexion au serveur d'annuaire. Réessayez dans un instant."));
  }
});

app.post("/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/auth/login");
  });
});

// ---------------------------------------------------------------
// Middleware d'authentification pour toutes les autres routes
// ---------------------------------------------------------------
app.use((req, res, next) => {
  if ((req.session as any).user) {
    next();
    return;
  }
  (req.session as any).returnTo = req.originalUrl;
  res.redirect("/auth/login");
});

// ---------------------------------------------------------------
// Proxy vers le dashboard (fichiers statiques servis par nginx interne)
// Cette route est utilisée si auth-proxy est devant nginx
// En production, nginx gère directement le proxy après validation
// du cookie de session via auth_request.
// ---------------------------------------------------------------
app.get("/auth/check", (req, res) => {
  const user = (req.session as any).user;
  if (user) {
    res.setHeader("X-Auth-User", user.username);
    res.setHeader("X-Auth-Display-Name", user.displayName ?? user.username);
    res.status(200).send("OK");
  } else {
    res.status(401).send("Unauthorized");
  }
});

// ---------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------
const server = createServer(app);
server.listen(PORT, () => {
  console.log(`[auth-proxy] En écoute sur le port ${PORT}`);
  console.log(`[auth-proxy] LDAP URLs: ${LDAP_URLS.join(", ")}`);
  console.log(`[auth-proxy] Groupe requis: ${LDAP_GROUP_DN}`);
});
