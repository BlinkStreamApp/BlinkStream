# BlinkStream - Política de Seguridad

## 1. Clasificación de secretos

| Tipo | Ejemplo | ¿Secreto? | Almacenamiento |
|------|---------|-----------|----------------|
| `VITE_SUPABASE_URL` | `https://xxx.supabase.co` | **No** (público por diseño) | `.env` local + vars de build |
| `VITE_SUPABASE_ANON_KEY` | JWT `eyJ...anon` | **Semi-secreto** ⚠️ | `.env` local + vars de build |
| `VITE_TWITCH_CLIENT_ID` | `kimne78...` (30 chars) | **No** (público por diseño) | `.env` local + vars de build |
| `TWITCH_APP_CLIENT_ID` | 30 chars | **No** | `.env` local + vars de build |
| `TAURI_PRIVATE_KEY` | minisign secret key | **SÍ** | GitHub Actions Secrets |
| `TAURI_KEY_PASSWORD` | passphrase | **SÍ** | GitHub Actions Secrets |
| `SUPABASE_SERVICE_ROLE_KEY` | JWT con `role:service_role` | **SÍ** (bypass RLS total) | NUNCA en cliente, solo Edge Functions |

> **Regla de oro:** la anon key va al cliente por diseño, pero si las **policies RLS** no están bien escritas, esa key se vuelve un caballo de Troya. `@hank` audita RLS; `@walter` decide.

## 2. Estado actual del repositorio (verificación 2026-06-25)

- `.env` está en `.gitignore` desde antes del commit inicial → **nunca fue commiteado al historial de git**.
- `git log --all --full-history -- .env` → 0 resultados.
- `git ls-files .env` → vacío.
- `.env.example` SÍ está tracked, pero solo contiene placeholders (`your_x_here`).

**Conclusión:** no hay historial que purgar. `git filter-repo` o BFG NO son necesarios en este momento y **no deben ejecutarse sin autorización explícita de @walter** (romperían el SHA de `master`).

## 3. Procedimiento de rotación de keys

### 3.1 Supabase — anon key (semi-secreta)

**Cuándo rotar:**
- Si un `.env` se commitea por accidente al historial de git.
- Si las RLS policies son revisadas y se sospecha exposición.
- Periódicamente (cada 6-12 meses) como buena práctica.

**Pasos:**
1. Accede a https://supabase.com/dashboard/project/oncbojnqxpxctwnhehau/settings/api
2. En "Project API keys" → click en "Roll anon / publishable key" (o el equivalente actual de la UI).
3. La key anterior se invalida instantáneamente; la nueva aparece con un botón "Copy".
4. Actualiza `.env` local con la nueva key.
5. Actualiza los **secrets de GitHub Actions** si el proyecto tiene CI que use esa key (buscar en `.github/workflows/*.yml`).
6. Si hay **Edge Functions deployadas** que pasen esa key al cliente, redeploy con `supabase functions deploy`.
7. **Invalida sesiones activas** si la filtración fue grave: Dashboard → Authentication → "Sign out all users" (opcional, solo si el atacante pudo impersonar usuarios).
8. Commit de seguimiento: `chore(security): rotate supabase anon key [skip-secret-scan]` con justificación en el body.

### 3.2 Twitch — Client ID

**Cuándo rotar:**
- Si el Client ID fue creado para una app que ya no controlas.
- Si la app fue reportada/suspendida por Twitch.

**Pasos:**
1. Accede a https://dev.twitch.tv/console/apps
2. Identifica la app (nombre exacto: ver `docs/client_ids_audit.md` para el mapping).
3. Click en "Manage" → "Reset Client Secret" (esto rota el **secret**, no el Client ID).
4. Para rotar el **Client ID** propiamente: registra una nueva app, actualiza `.env` y depreca la vieja.
5. Commit de seguimiento: `chore(security): rotate twitch client id [skip-secret-scan]`.

### 3.3 Tauri signing key (privada, ALTO RIESGO)

**Cuándo rotar:**
- Si `TAURI_PRIVATE_KEY` aparece en un log, issue, o commit por error.
- Si el repo deja de ser privado.

**Pasos:**
1. Genera nuevo par minisign: `minisign -G -p updater.pub -s updater.key -W`
2. Actualiza `updater.json` con la nueva public key.
3. En GitHub: Settings → Secrets and variables → Actions → `TAURI_PRIVATE_KEY` y `TAURI_KEY_PASSWORD` → update.
4. Redeploy release; los usuarios existentes deben re-descargar el binario.

## 4. Hooks de prevención

El repo incluye un hook pre-commit en `.githooks/pre-commit` que escanea cada commit buscando:

- JWTs de Supabase (anon o service role)
- URLs de proyectos Supabase reales
- Twitch Client IDs (30 chars alfanumericos)
- AWS Access Keys
- Claves privadas (`-----BEGIN PRIVATE KEY-----`)
- GitHub PATs (`gh[pousr]_...`)

### Activación (una sola vez por clon)

```bash
git config core.hooksPath .githooks
```

### Bypass de emergencia

```bash
BLINKSTREAM_SKIP_SCAN=1 git commit -m "fix: ..."
```

**Solo para emergencias reales y dejarlo documentado en el mensaje del commit.**

### Lista de falsos positivos permitidos

```bash
BLINKSTREAM_SCAN_ALLOW=supabase-jwt,github-token git commit -m "..."
```

## 5. Checklist antes de commitear cualquier `.env*`

- [ ] El archivo se llama `.env.example`, no `.env`
- [ ] Todos los valores son placeholders tipo `your_<x>_here` o `<YOUR_KEY>`
- [ ] El `.env` real está en `.gitignore` y solo vive en tu máquina local + GitHub Secrets
- [ ] El hook pre-commit está activado (`git config core.hooksPath`)

## 6. Contacto de seguridad

- **Auditor RLS / security:** `@hank`
- **Decisiones de merge a master:** `@walter`
- **Operaciones git / limpieza de historial:** `@saul`
