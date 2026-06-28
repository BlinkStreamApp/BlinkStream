# Twitch App Setup — BlinkStream

> **Tarea:** S-1 — Reemplazar los Client IDs hardcodeados de terceros (`kimne78...`, `z8bat49...`) por los de una **app Twitch propia del usuario**.
> **Estado:** Documento de soporte para la migración. No requiere acción inmediata: BlinkStream sigue funcionando con fallbacks legacy TEMPORALES (marcados con warning en consola).
> **Audiencia:** usuario final que despliega BlinkStream (tú).

---

## 0. ¿Por qué hay que hacer esto?

El código actual contiene **dos Client IDs de Twitch que NO son tuyos**:

| ID actual | Origen real | Riesgo |
|-----------|-------------|--------|
| `kimne78kx3ncx6brgo4mv6wki5h1ko` | Client ID interno del cliente web de Twitch (compartido con apps de chat no oficiales). | Twitch puede **revocarlo en cualquier momento** sin previo aviso. |
| `z8bat49d2evj5nkmg5kmkge24sa7z9` | Otro Client ID de terceros (apps de chat de la comunidad). | Igual: revocable. Además, **viola los ToS de Twitch** usar Client IDs ajenos para una app que distribuyes. |

**Consecuencias prácticas si Twitch los revoca:**

- 🔴 La app deja de obtener URLs de stream (GQL de Twitch devuelve 401/403).
- 🔴 La app deja de validar tokens OAuth de usuarios.
- 🔴 Los clips y VODs dejan de funcionar.

Registrar tu propia app cuesta ~5 minutos y elimina este riesgo de raíz.

---

## 1. Requisitos previos

- Una cuenta de Twitch (la que uses para desarrollar o como broadcaster).
- Acceso a https://dev.twitch.tv/console (puede pedir verificación de correo o 2FA).
- 5–10 minutos.

---

## 2. Registrar la aplicación propia

### Paso 1 — Acceder al dev console

1. Ve a **https://dev.twitch.tv/console/apps**.
2. Inicia sesión con tu cuenta de Twitch.
3. Si es la primera vez, acepta los **TOS de desarrollador de Twitch** y completa tu perfil (nombre, email, etc.).

### Paso 2 — Crear la app

1. Click en **"Register Your Application"** (o "Manage" si ya tienes otras).
2. Completa los campos:

   | Campo | Valor recomendado | Notas |
   |-------|-------------------|-------|
   | **Name** | `BlinkStream` (o `BlinkStream-Dev` si la tuya personal) | Debe ser único globalmente. Si está ocupado, añade sufijo `-<tuHandle>`. |
   | **OAuth Redirect URLs** | `https://oncbojnqxpxctwnhehau.supabase.co/functions/v1/twitch-auth` | **Una sola URL, en una sola línea, sin espacios al final.** Esta URL la usa la edge function `twitch-auth` de Supabase como callback OAuth. |
   | **Category** | `Application Integration` o `Game Integration` | Twitch suele aceptarlo. |
   | **Client Type** | `Confidential` | Necesario porque BlinkStream usa Client Secret en el backend Rust/edge function. |

3. Acepta los TOS y click **"Create"**.

### Paso 3 — Obtener las credenciales

1. En la lista de apps, click en **"Manage"** sobre la app recién creada.
2. Verás dos valores críticos:
   - **Client ID** — un string de 30 caracteres alfanuméricos. Es público por diseño (va al frontend).
   - **Client Secret** — click en "Show" para revelarlo. **Trátalo como una contraseña.** Solo lo usa el backend (edge function de Supabase y opcionalmente el binario Rust de Tauri).

> ⚠️ **No compartas el Client Secret** en commits, issues, capturas o logs. Si se filtra, usa el botón "Reset Client Secret" en la misma pantalla.

### Paso 4 — Verificar la Redirect URL

1. En la misma pantalla de "Manage", busca la sección **"OAuth Redirect URLs"**.
2. Confirma que la URL es exactamente:
   ```
   https://oncbojnqxpxctwnhehau.supabase.co/functions/v1/twitch-auth
   ```
3. Si la editaste, click **"Save Changes"**. Twitch cachea redirects agresivamente: si algo falla, espera 30 segundos y reintenta.

---

## 3. Configurar las variables de entorno

Copia el archivo `.env.example` a `.env` si aún no lo tienes:

```bash
cp .env.example .env
```

Edita `.env` y rellena los tres valores. **Usa el MISMO Client ID en las dos primeras vars** (es una sola app Twitch):

```dotenv
# --- Twitch API - Client ID Público (frontend) ---
# Lo usa src/utils/twitch.js para GQL + src-tauri/src/lib.rs para backend Rust.
VITE_TWITCH_CLIENT_ID=<pega-aqui-tu-client-id-de-30-chars>

# --- Twitch API - Client ID de Aplicación (frontend, llamadas autenticadas) ---
# Lo usa src/utils/twitch.js cuando hay token de usuario.
VITE_TWITCH_APP_CLIENT_ID=<pega-aqui-tu-client-id-de-30-chars>

# --- Twitch API - Client ID para el backend (Tauri Rust) ---
# TWITCH_CLIENT_ID llega al binario Rust en tiempo de compilación.
# El secret NO es necesario en el cliente ni en el binario; vive solo
# en la edge function de Supabase (ver paso 4).
TWITCH_CLIENT_ID=<pega-aqui-tu-client-id-de-30-chars>
```

> 💡 **¿Por qué dos vars frontend con el mismo valor?**
> Históricamente el proyecto distinguía entre un Client ID "público" y uno "de app".
> Como solo estás registrando **una** app Twitch, las dos son la misma.
> La duplicación se mantiene por compatibilidad con el código actual y porque
> en el futuro podrías querer una segunda app Twitch dedicada a operaciones autenticadas.

---

## 4. Configurar los secrets en Supabase (Edge Function)

El Client Secret **NO va al frontend ni al binario Rust**. Solo lo necesita la
edge function `twitch-auth` de Supabase, que es la que ejecuta el intercambio
OAuth code → access_token.

### Paso 1 — Abrir el dashboard de Supabase

1. Ve a **https://supabase.com/dashboard/project/oncbojnqxpxctwnhehau/settings/functions** (sección "Edge Functions" o "Secrets" según la versión de la UI).

### Paso 2 — Añadir los secrets

Crea (o actualiza) los siguientes secrets:

| Nombre del secret | Valor |
|-------------------|-------|
| `TWITCH_CLIENT_ID` | Tu Client ID (30 chars alfanuméricos) |
| `TWITCH_CLIENT_SECRET` | Tu Client Secret (marcado como "revealed") |

> 🔒 Los secrets en Supabase se almacenan cifrados y **nunca** se exponen al cliente.

### Paso 3 — Redeploy de la edge function

Para que los nuevos secrets tengan efecto, redeploya `twitch-auth`:

```bash
supabase functions deploy twitch-auth --project-ref oncbojnqxpxctwnhehau
```

(O usa el botón "Deploy" del dashboard.)

### Paso 4 — Verificar

1. Abre la app BlinkStream.
2. Click en "Conectar con Twitch".
3. Debería redirigirte a `id.twitch.tv/oauth2/authorize` mostrando **el nombre de TU app** ("BlinkStream" o el que hayas elegido), no uno genérico.
4. Si ves el nombre correcto, estás validado. ✅

---

## 5. Verificación final

Una vez configurado todo, abre la consola del WebView (Ctrl+Shift+I en dev mode)
o revisa los logs de la app. **NO deberías ver este warning**:

```
[BlinkStream] ⚠️ Twitch Client ID legacy de terceros en uso. Registra tu propia app:
  https://dev.twitch.tv/console/apps
  Docs: docs/TWITCH_APP_SETUP.md
```

Si **no** ves el warning, los tres lugares (frontend JS, Tauri Rust, edge function)
están usando tu Client ID propio. ✅

---

## 6. Si algo falla

| Síntoma | Causa probable | Solución |
|---------|----------------|----------|
| Warning de legacy sigue apareciendo | `.env` no se está leyendo o el valor está vacío | Verifica que `VITE_TWITCH_CLIENT_ID` tiene 30 chars y reinicia `pnpm dev`. |
| OAuth devuelve `redirect_uri_mismatch` | La URL en dev console no coincide | Confirma carácter por carácter: `https://oncbojnqxpxctwnhehau.supabase.co/functions/v1/twitch-auth` |
| GQL devuelve 401 con tu Client ID propio | App nueva esperando verificación de Twitch | Espera 1-5 minutos (propagación de Twitch). Si persiste, contacta a Twitch. |
| Edge function da 500 con "Falta configurar TWITCH_CLIENT_ID" | Secret no configurado en Supabase | Repite paso 4.2 y re-deploya. |
| Clip/VOD deja de funcionar tras migrar | Streamlink cacheó el Client ID viejo | Reinicia la app completamente (no solo refrescar). |

---

## 7. Limpieza futura (TODO post-migración)

Una vez que **todos los usuarios** de tu build distribuido estén usando Client IDs propios (puede ser: solo tú si es una build personal, o una fecha de release), el equipo de desarrollo debería:

1. Eliminar los fallbacks legacy de `src/utils/twitch.js` y `src-tauri/src/lib.rs`.
2. Convertir los warnings en errores duros si `VITE_TWITCH_CLIENT_ID` falta.
3. Eliminar la sección de fallbacks de `docs/TWITCH_APP_SETUP.md` (o moverla a archivo histórico).

**No hacerlo antes de tiempo** rompería instalaciones que aún no migraron.

---

## 8. Referencias

- Twitch Dev Console: https://dev.twitch.tv/console/apps
- Twitch OAuth docs: https://dev.twitch.tv/docs/authentication/
- Twitch scopes usados por BlinkStream: ver `supabase/functions/twitch-auth/index.ts` (sección "TWITCH OAUTH SCOPES").
- Handoff original: tarea WT-20260628-03.
