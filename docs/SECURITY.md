# BlinkStream - Security Policy & Guidelines

## 1. Secret & Token Classification

| Key / Variable | Example Value | Sensitive? | Storage Location |
|---|---|---|---|
| `VITE_SUPABASE_URL` | `https://xxx.supabase.co` | **No** (Public by design) | `.env` local + build-time vars |
| `VITE_SUPABASE_ANON_KEY` | JWT `eyJ...anon` | **Semi-Sensitive** ⚠️ | `.env` local + build-time vars |
| `VITE_TWITCH_CLIENT_ID` | `kimne78...` (30 chars) | **No** (Public by design) | `.env` local + build-time vars |
| `TWITCH_APP_CLIENT_ID` | 30 chars | **No** | `.env` local + build-time vars |
| `TAURI_PRIVATE_KEY` | Minisign cryptographic secret | **CRITICAL SECRET** | GitHub Actions Secrets |
| `TAURI_KEY_PASSWORD` | Key passphrase | **CRITICAL SECRET** | GitHub Actions Secrets |
| `SUPABASE_SERVICE_ROLE_KEY` | JWT with `role:service_role` | **CRITICAL SECRET** (Bypasses RLS) | **NEVER in client**; Server Edge Functions only |

> **Security Golden Rule:** The anonymous Supabase publishable key (`VITE_SUPABASE_ANON_KEY`) resides on the client by design. However, robust Row Level Security (**RLS**) policies must be actively maintained in Postgres to prevent unauthorized data mutations or privilege escalation.

## 2. Repository Hygiene & Secret Protection

- Preliminary audits confirm that `.env` files remain explicitly defined within `.gitignore` and have **never been exposed in Git history**.
- Pre-commit scanning protections guarantee that private tokens and local environment overrides cannot be inadvertently published to origin repositories.
- Only `.env.example` is tracked, containing completely inert dummy values (`your_x_here`).

## 3. Cryptographic Key Rotation Procedures

### 3.1 Supabase Publishable / Anon Key

**When to rotate:**
- If an actual `.env` containing production keys is accidentally exposed in an untrusted log or public medium.
- As part of routine security maintenance (every 6 to 12 months).

**Step-by-step instructions:**
1. Navigate to your Supabase Project Settings → API Dashboard.
2. Locate **Project API keys** and select **Roll anon / publishable key**.
3. Immediately update all developer local `.env` files with the newly generated publishable token.
4. Update cloud deployment environments and **GitHub Actions Secrets** (`.github/workflows/*.yml` references).
5. Redeploy active backend Edge Functions using `supabase functions deploy` to propagate the new configuration.
6. Commit the adjustment with message: `chore(security): rotate supabase anon key [skip-secret-scan]`.

### 3.2 Twitch Application Client ID & Secret

**When to rotate:**
- When transitioning application ownership or upon developer credentials transfer.
- If third-party OAuth redirect vulnerabilities are detected or reported by Twitch Security.

**Step-by-step instructions:**
1. Access the Twitch Developer Console via https://dev.twitch.tv/console/apps.
2. Locate your BlinkStream application mapping.
3. Select **Manage** → **Reset Client Secret** to instantly rotate your server-side OAuth secret.
4. If full application re-registration is required to obtain a fresh Client ID, register a new client profile, update `.env` overrides, and deprecate the legacy profile.

### 3.3 Tauri Digital Signing Key (HIGH RISK)

**When to rotate:**
- Immediately upon any potential exposure of `TAURI_PRIVATE_KEY` or `TAURI_KEY_PASSWORD`.

**Step-by-step instructions:**
1. Generate a new high-security Minisign key pair:
   ```bash
   minisign -G -p updater.pub -s updater.key -W
   ```
2. Replace the public verification key inside `updater.json` with the newly generated `updater.pub` content.
3. In GitHub Repository Settings → **Secrets and variables** → **Actions**, update both `TAURI_PRIVATE_KEY` and `TAURI_KEY_PASSWORD` with the new credentials.
4. Trigger an immediate patch release to publish newly signed updater verification signatures.

## 4. Automated Pre-Commit Security Guardrails

BlinkStream incorporates a tailored git pre-commit scanning engine located at `.githooks/pre-commit` designed to intercept:

- Supabase JSON Web Tokens (Anon and Service Role patterns)
- Hardcoded production cloud project URLs
- Twitch OAuth Client IDs and Secrets
- Cloud IAM Credentials (AWS / GCP / Azure)
- Private PEM cryptographic blocks (`-----BEGIN PRIVATE KEY-----`)
- GitHub Personal Access Tokens (`ghp_*`, `gho_*`, `ghu_*`)

### Activating Security Hooks (One-Time Setup per Workspace)

```bash
git config core.hooksPath .githooks
```

### Emergency Override Bypass

For exceptional automated chores or verified benign test fixtures:

```bash
BLINKSTREAM_SKIP_SCAN=1 git commit -m "fix: explicit justification for bypass"
```

### Whitelisting False Positives

To explicitly approve benign pattern matches during a commit:

```bash
BLINKSTREAM_SCAN_ALLOW=supabase-jwt,github-token git commit -m "..."
```

## 5. Pre-Commit Checklist for Environment Files

- [ ] Ensure any newly created template file is named `.env.example`, **never** `.env`
- [ ] Verify that all assigned values consist strictly of safe dummy placeholders (`your_value_here`)
- [ ] Confirm that your local operational `.env` remains fully blocked by `.gitignore`
- [ ] Verify that git security hooks remain active via `git config core.hooksPath`

## 6. Security Contact & Vulnerability Reporting

If you discover a security vulnerability within BlinkStream, please DO NOT report it through public GitHub issues. Reach out directly to the core development team for responsible disclosure and remediation coordinating.

- **Lead Security & RLS Architecture Reviewer:** `@hank`
- **Release & Mergers Decision Authority:** `@walter`
- **Repository Hygiene & Audit Operations:** `@saul`

