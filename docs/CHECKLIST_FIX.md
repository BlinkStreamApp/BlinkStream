# Checklist de Fix para BlinkStream

> **Regla fundamental**: Si un fix sobrevive 2 rondas sin resolver, se convierte en tarea de auditoría, no de fix.

## Antes de tocar código

- [ ] ¿Hice backup? `.\scripts\backup.ps1 -Description "<TASK_ID>"`
- [ ] ¿Leí el archivo completo que voy a modificar? (no solo la zona del bug)
- [ ] ¿Verifiqué que el bug existe con un caso de reproducción? (log/screenshot)
- [ ] ¿Busqué TODOS los lugares donde aparece el patrón? `grep -rn "<string>" src/`
- [ ] ¿Revisé el historial de `git log --all -p -- src/<archivo>`?
- [ ] ¿Identifiqué qué features dependen de ese archivo? (vods/clips/login/preview/CP/moderation)
- [ ] ¿Hay un test E2E o unitario que cubra la zona?

## Durante el fix

- [ ] ¿Cambié solo lo necesario?
- [ ] ¿Mantuve el contrato de la API pública?
- [ ] ¿Si toqué un fetch, mantuve el orden: `getStoredToken → getHeaders → fetch → AbortSignal.timeout`?
- [ ] ¿Si toqué un invoke Tauri, lo guardé con `isTauri()`?
- [ ] ¿Si toqué una query GQL, usé `sanitizeChannelForGraphQL()` y variables `{ login: ... }`?
- [ ] ¿Si toqué un `console.log`, está bajo `import.meta.env.DEV`?
- [ ] ¿Si toqué un `window.open`, lleva `noopener,noreferrer`?

## Después del fix

- [ ] `npm run lint` → 0 errors
- [ ] `npm test` → todos los tests pasan
- [ ] `npm run check:legacy` → 0 regresiones
- [ ] `npm run build` → termina sin error
- [ ] Si el fix toca vods/clips/login: añadir test E2E
- [ ] Verificación binaria post-build
- [ ] Si el fix introduce un patrón nuevo que podría romperse: crear feature flag

## Anti-patrones prohibidos (detectados por pre-build hook)

Los siguientes strings NO deben aparecer en el código (excepto en tests/documentación):

- `Math.floor(Math.random() * 1e7)` (CWE-330)
- `bs_app_token_cache` o `APP_TOKEN_CACHE_KEY` (token en disco)
- `window.open(` sin `noopener,noreferrer` (CWE-1022)
- `user(login: "${...}"` o `channelName: "${...}"` en queries GQL (CWE-94)
- `invoke(` directo sin guard `isTauri()` (rompe `npm run dev`)
- Caracteres `a-acute e-acute i-acute o-acute u-acute n-tilde` mal decodificados (mojibake UTF-8 -> Latin-1)
- `URL.createObjectURL` en preview (rompe live streams)
- `thumbnailURL` (mayúscula — campo GQL incorrecto)
- `criteria: { filter: LAST_WEEK }` (enum obsoleto)
- `kimne78kx3ncx6brgo4mv6wki5h1ko` (Client ID legacy)

Si necesitas reintroducir alguno (falso positivo), agrega en la misma línea: `// ALLOWED-REGRESSION: <razón>`

## Cómo evitar el patrón "arreglé X, rompí Y"

1. El test E2E del flujo afectado debe pasar antes y después del fix
2. Si el fix es en un módulo compartido: test E2E de TODOS los flujos consumidores
3. Si cambias la firma de un export: `grep -rn "<export_name>" src/` para actualizar call sites
4. La regla de oro: **un fix = un commit + un test que falla antes y pasa después**

## Override de emergencia

```powershell
$env:BLINKSTREAM_SKIP_REGRESSION = "1"
.\build-exe.ps1
```

**No usar el override sin documentar en el commit por qué fue necesario.**
