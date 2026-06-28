# INSTRUCCIONES PARA EL USUARIO - Rotación manual de keys

**Tarea:** WT-20260625-14
**Fecha:** 2026-06-25
**Agente:** `@saul` (operaciones git)
**Estado del repo:** `.env` NUNCA estuvo en el historial de git. **No hay nada que purgar.** Lo que sí necesitas es **rotar preventivamente** las keys que aparecen en tu `.env` local, porque aunque el archivo no se commiteó, queremos aplicar la política "rotate on suspicion" antes de que pase a mayores.

---

## ✅ Lo que `@saul` ya hizo (no tienes que repetirlo)

- [x] Verificó `git log --all --full-history -- .env` → 0 resultados (el `.env` nunca salió de tu míquina).
- [x] Confirmó que `.env` estí en `.gitignore` (línea 41) - correctamente excluido.
- [x] Reforzó `.gitignore` con `.env*` (excepto `.env.example`) - ahora cualquier variante futura tambi→n queda excluida.
- [x] Creó el hook pre-commit en `.githooks/pre-commit` con escaneo de secretos.
- [x] Creó `docs/SECURITY.md` con el procedimiento completo de rotación.
- [x] Verificó que el repo no contiene las keys reales en ningún archivo tracked.

---

## 🚨 Keys que tienes que rotar manualmente

| Key | Dónde se usa | Tipo de riesgo | Plazo sugerido |
|-----|--------------|----------------|----------------|
| `VITE_SUPABASE_ANON_KEY` (JWT `eyJ...`) | `src/utils/supabase.js` | **Semi-secreto** - bypass RLS si policies mal escritas | **Esta semana** |
| `VITE_TWITCH_CLIENT_ID` (`kimne78...`) | `src/utils/twitch.js` | Público por diseño, pero rotar si fue registrado sin tu control | **Este mes** |
| `VITE_TWITCH_APP_CLIENT_ID` (`z8bat49...`) | `src/utils/twitch.js` | Idem | **Este mes** |

> 🔔 **Nota importante sobre los `TWITCH_CLIENT_ID` de tu `.env`:** los valores `kimne78kx3ncx6brgo4mv6wki5h1ko` y `z8bat49d2evj5nkmg5kmkge24sa7z9` circulan públicamente en apps de chat no oficiales de Twitch. **Verifica en https://dev.twitch.tv/console/apps que esas apps te pertenecen a ti** - si no, son Client IDs de terceros y deberís reemplazarlos por los de tu propia app registrada.

---

## 🔨 Pasos concretos que Tú tienes que hacer

### Paso 1 - Rotar la anon key de Supabase (5 min)

1. Abre https://supabase.com/dashboard/project/oncbojnqxpxctwnhehau/settings/api
2. En **"Project API keys"**, busca la fila **"anon" / "publishable"**.
3. Click en el menú `†` → **"Roll key"** (o el equivalente según la versión de la UI de Supabase).
4. Se genera una nueva key automíticamente. La vieja se invalida.
5. Copia la nueva key.
6. Abre tu `.env` local y reemplaza el valor de `VITE_SUPABASE_ANON_KEY`.
7. **Si usas GitHub Actions** con esta key: ve a Settings → Secrets and variables → Actions → `VITE_SUPABASE_ANON_KEY` → Update.
8. **Si tienes Edge Functions deployadas** que dependen de esta key, redeploy: `supabase functions deploy`.

### Paso 2 - Verificar/registrar las apps de Twitch (10 min)

1. Abre https://dev.twitch.tv/console/apps
2. Revisa la lista de apps registradas a tu nombre.
3. **Si `kimne78...` o `z8bat49...` NO aparecen** → son de terceros. **Regístrate** una app nueva propia en https://dev.twitch.tv/console/apps/create y usa su Client ID.
4. **Si Sí aparecen y son tuyas** → no necesitas rotarlas (son públicas por diseño). Pero anota la fecha en `docs/client_ids_audit.md`.
5. Actualiza `.env` con los nuevos Client IDs si aplica.
6. **Si necesitas rotar el Client Secret** (no aplica en tu caso porque no usas app secret en el cliente): click en "Manage" → "Reset Client Secret".

### Paso 3 - Activar el hook pre-commit (30 seg)

Una sola vez por clon del repo:

```bash
git config core.hooksPath .githooks
```

Verifica que funciona intentando commitear algo con una key falsa - debería bloquearlo.

### Paso 4 - Confirmar el estado del repo (1 min)

```bash
git log --all --full-history -- .env     # debe dar 0 resultados
git ls-files | grep -E '^\.env'          # solo debe aparecer .env.example
```

---

## 🚀 Si encuentras resistencia

- **Supabase no muestra el botón "Roll key":** puede que la UI haya cambiado. Busca "Rotate" o contacta a soporte de Supabase. Como workaround: crea un nuevo proyecto y migra las tablas (no es lo ideal, pero funciona).
- **No puedes acceder a dev.twitch.tv/console:** la app puede estar registrada con otra cuenta. Si es crítica, registra una nueva.
- **El hook pre-commit bloquea un commit legítimo con un falso positivo:
  ```bash
  BLINKSTREAM_SCAN_ALLOW=supabase-jwt git commit -m "..."
  ```
  Y documenta el falso positivo en el mensaje del commit.

---

## 👋 Hand-off

Cuando termines la rotación, avisa a `@walter` con el formato:

```
=== SECURITY ROTATION REPORT ===
fecha: 2026-06-25
supabase_anon_key: [ROTATED / NO_ROTATED_NEEDED]
twitch_client_id_1 (kimne78): [VERIFIED_MINE / REPLACED_WITH_NEW]
twitch_client_id_2 (z8bat49): [VERIFIED_MINE / REPLACED_WITH_NEW]
hook_precommit: [ACTIVATED / SKIPPED]
evidencia: git log --all -- .env → 0 hits
```

Si tienes cualquier duda, **Better Call Saul.**

---

## 🔧 Configurar Twitch App Propia (tarea S-1, 2026-06-28)

**Tarea:** WT-20260628-03 (S-1)
**Agente:** `@saul`
**Estado:** cambios aplicados al código, pendientes de tu configuración. La app sigue funcionando con fallbacks legacy TEMPORALES (verís un warning en consola del WebView).

### ¿Qu→ cambió?

- [✓] `src/utils/twitch.js` ahora lee `VITE_TWITCH_CLIENT_ID` y `VITE_TWITCH_APP_CLIENT_ID` de tu `.env`. Si faltan, usa los IDs de TERCEROS como fallback + warning.
- [✓] `src-tauri/src/lib.rs` ahora lee `TWITCH_CLIENT_ID` (build-time via `option_env!()`). Misma lógica de fallback + warning.
- [✓] `.env.example` documenta todas las variables.
- [✓] `docs/TWITCH_APP_SETUP.md` explica paso a paso cómo registrar tu app.
- [ ] **Pendiente tuyo:** registrar tu app en https://dev.twitch.tv/console/apps y rellenar las variables en `.env`.

### Pasos concretos (resumen; detalles en `docs/TWITCH_APP_SETUP.md`)

1. **Registra tu app** en https://dev.twitch.tv/console/apps (botón **Register Your Application**).
   - **Name:** `BlinkStream` (o el que prefieras).
   - **OAuth Redirect URL:** `https://oncbojnqxpxctwnhehau.supabase.co/functions/v1/twitch-auth`
   - **Client Type:** `Confidential`
2. **Copia** el `Client ID` (30 chars) y el `Client Secret`.
3. **Edita tu `.env`** y rellena:
   ```dotenv
   VITE_TWITCH_CLIENT_ID=<tu-client-id>
   VITE_TWITCH_APP_CLIENT_ID=<tu-client-id>
   TWITCH_CLIENT_ID=<tu-client-id>
   ```
4. **Configura los secrets en Supabase** (Dashboard > Edge Functions > Secrets):
   - `TWITCH_CLIENT_ID` = tu Client ID
   - `TWITCH_CLIENT_SECRET` = tu Client Secret
5. **Redeploya la edge function** para que tome los secrets:
   ```bash
   supabase functions deploy twitch-auth --project-ref oncbojnqxpxctwnhehau
   ```
6. **Recompila el binario Tauri** (si haces build local) con `TWITCH_CLIENT_ID=<tu-id>` en el entorno.
7. **Verifica:** arranca la app y comprueba que NO sale el warning de legacy en la consola del WebView.

### Verificación rípida

Abre la consola del WebView (Ctrl+Shift+I en dev) y busca:

```
[BlinkStream] ⚠️ Twitch Client ID legacy de terceros en uso.
```

- **Si sale** → tu `.env` no se estí leyendo o el `VITE_TWITCH_CLIENT_ID` estí vacío.
- **Si NO sale** → todo correcto. Estís usando tu app propia. ✅

### Si quieres revertir

El código actual NO requiere que migres ya. Puedes seguir usando los IDs legacy; los verís en consola como warning pero la app funcionarí igual que antes. La migración es una mejora de seguridad y robustez, no un fix urgente.

### Documentación completa

Lee `docs/TWITCH_APP_SETUP.md` para troubleshooting detallado y consideraciones de seguridad.
