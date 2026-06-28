# Icon System Audit — BlinkStream

> Scouting + reemplazo priorizado. NO commits. NO push.
> Task: `WT-20260628-40` · Owner: @marie (AG-018) · Date: 2026-06-28

---

## 1. Resumen ejecutivo

- **Total de `<svg>` inline catalogados en `src/`:** 75
- **Distribuidos en:** 22 archivos `.jsx`
- **`lucide-react` instalado:** NO (verificado en `package.json` línea 17-28 — no aparece)
- **Coherencia actual:** BAJA. Mezcla de outline, filled, tamaños 10–42 px, stroke 1.2–28, viewBox 12–512.
- **Recomendación de set:** Lucide Icons (alineación con la app: stroke 2, 24px viewBox, `currentColor`).
- **Iconos a reemplazar (prioridad):** 8 ALTA · 5 MEDIA · 62 OK/baja
- **Esfuerzo:** M (1 sprint — refactor de iconos críticos + extraer a `src/components/icons/`).
- **Commits:** 0

---

## 2. FASE 1 — Catálogo completo de iconos

> Método: `grep -rn "<svg" src/` + lectura contextual. Solo `<svg>` literales; se ignoran SVGs importados desde assets (logo.png, vite.svg).

| # | Componente | Línea | Función | viewBox | Tamaño | Stroke | Estilo | Notas |
|---|------------|------:|---------|--------:|-------:|-------:|--------|-------|
| 1 | `App.jsx` | 77 | minimize window | `0 0 12 12` | 10×10 | filled rect | custom | OK — TitleBar control |
| 2 | `App.jsx` | 80 | maximize window | `0 0 12 12` | 10×10 | 1.2 outline | custom | OK — TitleBar control |
| 3 | `App.jsx` | 83 | close window | `0 0 12 12` | 10×10 | 1.3 path | custom | OK — TitleBar control |
| 4 | `App.jsx` | 89 | chat (on) | `0 0 24 24` | 20×20 | 2.2 outline | outline | OK — coherente con set |
| 5 | `App.jsx` | 90 | chat (off) | `0 0 24 24` | 20×20 | 2.2 outline | outline | OK — derivada de chat |
| 6 | `App.jsx` | 91 | settings (gear) | `0 0 30 30` | 20×20 | 2.2 outline | outline | ⚠️ **viewBox 30** (inconsistente) — duplicado en VideoPlayer |
| 7 | `App.jsx` | 371 | recording list | `0 0 24 24` | 20×20 | 2.2 outline | outline | OK — bien diseñado |
| 8 | `App.jsx` | 409 | logout | `0 0 24 24` | 16×16 | 2.2 outline | outline | OK |
| 9 | `App.jsx` | 425 | twitch logo (filled) | `0 0 24 24` | 16×16 | filled | filled brand | OK — brand asset |
| 10 | `App.jsx` | 448 | channel points (key) | `0 0 24 24` | 20×20 | 2 outline | outline | OK — bien diferenciado |
| 11 | `HomeScreen.jsx` | 194 | x / remove (fav) | `0 0 24 24` | 14×14 | 2.2 outline | outline | OK — duplicado 5+ veces |
| 12 | `HomeScreen.jsx` | 323 | play (ver ahora) | `0 0 24 24` | 14×14 | filled | filled | ⚠️ **filled con outline** — inconsistente con otros play del player |
| 13 | `HomeScreen.jsx` | 343 | chevron-left | `0 0 24 24` | 20×20 | 2.4 outline | outline | OK |
| 14 | `HomeScreen.jsx` | 346 | chevron-right | `0 0 24 24` | 20×20 | 2.4 outline | outline | OK |
| 15 | `HomeScreen.jsx` | 617 | sort-online (circle+dashes) | `0 0 24 24` | 16×16 | 2.2 outline | outline | OK — custom sort |
| 16 | `HomeScreen.jsx` | 619 | sort-up (arrow up) | `0 0 24 24` | 16×16 | 2.2 outline | outline | OK — custom sort |
| 17 | `HomeScreen.jsx` | 621 | sort-down (arrow down) | `0 0 24 24` | 16×16 | 2.2 outline | outline | OK — custom sort |
| 18 | `HomeScreen.jsx` | 629 | chevron-down (collapse) | `0 0 24 24` | 16×16 | filled | filled | OK |
| 19 | `HomeScreen.jsx` | 698 | info-circle | `0 0 24 24` | 18×18 | 2.2 outline | outline | OK — duplicado |
| 20 | `HomeScreen.jsx` | 714 | twitch logo (empty state) | `0 0 24 24` | 42×42 | filled | filled brand | OK |
| 21 | `HomeScreen.jsx` | 754 | gamepad placeholder | `0 0 24 24` | 24×24 | filled rect | filled | ⚠️ **placeholder muy básico** — poco descriptivo |
| 22 | `HomeScreen.jsx` | 842 | x / remove (recent) | `0 0 24 24` | 12×12 | 2.2 outline | outline | OK |
| 23 | `VideoPlayer.jsx` | 32 | play | `0 0 24 24` | 24×24 | filled | filled | ⚠️ **inconsistente con outline** del resto del player |
| 24 | `VideoPlayer.jsx` | 33 | pause | `0 0 24 24` | 24×24 | filled rects | filled | OK — por convención media player |
| 25 | `VideoPlayer.jsx` | 34 | volume-high | `0 0 24 24` | 22×22 | 2.2 outline | outline | OK |
| 26 | `VideoPlayer.jsx` | 35 | volume-mute | `0 0 24 24` | 22×22 | 2.2 outline | outline | OK — bien diferenciado |
| 27 | `VideoPlayer.jsx` | 36 | fullscreen | `0 0 24 24` | 20×20 | 2.2 outline | outline | OK |
| 28 | `VideoPlayer.jsx` | 37 | theatre | `0 0 512 512` | 20×20 | 28 outline | custom | 🚨 **viewBox 512, stroke 28** — MISMATCH enorme |
| 29 | `VideoPlayer.jsx` | 38 | clip | `0 0 512 512` | 19×19 | 28 outline | custom | 🚨 **viewBox 512, stroke 28** — MISMATCH enorme |
| 30 | `VideoPlayer.jsx` | 39 | vod | `0 0 512 512` | 19×19 | 28 outline | custom | 🚨 **viewBox 512, stroke 28** — MISMATCH enorme |
| 31 | `VideoPlayer.jsx` | 40 | settings (gear) | `0 0 30 30` | 20×20 | 2.2 outline | outline | ⚠️ **viewBox 30** — duplicado en App.jsx |
| 32 | `VideoPlayer.jsx` | 63 | x (close panel) | `0 0 24 24` | 16×16 | 2.2 outline | outline | OK |
| 33 | `VideoPlayer.jsx` | 619 | volume (audio-only state) | `0 0 24 24` | 32×32 | 2.2 outline | outline | OK |
| 34 | `VideoPlayer.jsx` | 678 | help-circle | `0 0 24 24` | 15×15 | 2.2 outline | outline | OK |
| 35 | `VideoPlayer.jsx` | 692 | monitor (video mode) | `0 0 24 24` | 18×18 | 2.2 outline | outline | OK |
| 36 | `VideoPlayer.jsx` | 694 | speaker (audio-only) | `0 0 24 24` | 18×18 | 2.2 outline | outline | OK |
| 37 | `VideoPlayer.jsx` | 718 | record-dot | `0 0 24 24` | 16×16 | 2.2 outline | outline | ⚠️ — círculo doble feo |
| 38 | `VideoPlayer.jsx` | 730 | external-link | `0 0 24 24` | 16×16 | 2.2 outline | outline | OK |
| 39 | `VideoPlayer.jsx` | 733 | pip (picture-in-picture) | `0 0 24 24` | 16×16 | 2.2 outline | outline | OK |
| 40 | `VideoPlayer.jsx` | 757 | x (close mac help) | `0 0 24 24` | 16×16 | 2.2 outline | outline | OK |
| 41 | `Chat.jsx` | 974 | settings (gear) | `0 0 30 30` | 14×14 | 2.2 outline | outline | ⚠️ **viewBox 30** — 3ª copia del mismo icono |
| 42 | `Chat.jsx` | 1200 | smile | `0 0 24 24` | 18×18 | 2.2 outline | outline | OK — smile para emotes |
| 43 | `Chat.jsx` | 1209 | search (emote picker) | `0 0 24 24` | 12×12 | 2.5 outline | outline | OK |
| 44 | `Chat.jsx` | 1292 | emote-cat (all) | `0 0 30 30` | 14×14 | 2.5 outline | outline | OK — tab icon |
| 45 | `Chat.jsx` | 1293 | emote-fav (heart) | `0 0 30 30` | 14×14 | 2.5 outline | outline | OK — tab icon |
| 46 | `Chat.jsx` | 1294 | emote-recent (clock) | `0 0 30 30` | 14×14 | 2.5 outline | outline | OK — tab icon |
| 47 | `Chat.jsx` | 1295 | emote-channel (monitor) | `0 0 30 30` | 14×14 | 2.5 outline | outline | OK — tab icon |
| 48 | `recording/RecordingDrawer.jsx` | 23 | close (drawer) | `0 0 24 24` | 16×16 | 2.2 outline | outline | OK |
| 49 | `recording/RecordingDrawer.jsx` | 72 | refresh | `0 0 24 24` | 14×14 | 2.2 outline | outline | OK — bien diseñado |
| 50 | `recording/GlobalRecordingToggle.jsx` | 20 | circle (off state) | `0 0 24 24` | 16×16 | 2.2 outline | outline | OK |
| 51 | `recording/GlobalRecordingToggle.jsx` | 28 | dot (on state) | `0 0 24 24` | 16×16 | filled | filled | OK — filled OK para estado activo |
| 52 | `moderation/ModPanel.jsx` | 214 | close | `0 0 24 24` | 14×14 | 2.4 outline | outline | OK |
| 53 | `moderation/ViewerList.jsx` | 104 | search (mod list) | `0 0 24 24` | 11×11 | 2.5 outline | outline | OK |
| 54 | `channelpoints/PPanel.jsx` | 32 | close | `0 0 24 24` | 18×18 | 2.2 outline | outline | OK |
| 55 | `channelpoints/CPPanel.jsx` | 40 | coins (2 circles) | `0 0 24 24` | 18×18 | 2 outline | outline | ⚠️ — confuso, parece dos monedas pero no claro |
| 56 | `channelpoints/RedeemModal.jsx` | 118 | coin (filled) | `0 0 24 24` | 14×14 | filled circle | filled | ⚠️ — círculo plano sin detalle |
| 57 | `channelpoints/RewardCard.jsx` | 110 | coin (filled) | `0 0 24 24` | 12×12 | filled circle | filled | ⚠️ — círculo plano sin detalle |
| 58 | `channelpoints/RewardForm.jsx` | 325 | coin (filled) | `0 0 24 24` | 12×12 | filled circle | filled | ⚠️ — círculo plano sin detalle |
| 59 | `VodPlayer.jsx` | 110 | close | `0 0 24 24` | 18×18 | 2.2 outline | outline | OK |
| 60 | `VodPlayer.jsx` | 135 | play (VOD placeholder) | `0 0 24 24` | 28×28 | filled | filled | OK |
| 61 | `UpdateChecker.jsx` | 46 | info-circle | `0 0 24 24` | 20×20 | 2.2 outline | outline | OK — duplicado |
| 62 | `StreamInfo.jsx` | 230 | star (fav toggle) | `0 0 24 24` | 16×16 | 2.2 outline | outline | OK — duplicado en Onboarding |
| 63 | `Settings.jsx` | 23 | close | `0 0 24 24` | 18×18 | 2.2 outline | outline | OK |
| 64 | `AboutDialog.jsx` | 15 | close | `0 0 24 24` | 18×18 | 2.2 outline | outline | OK |
| 65 | `AboutDialog.jsx` | 19 | paypal | `0 0 24 24` | 16×16 | filled | filled brand | OK — brand |
| 66 | `Onboarding.jsx` | 8 | twitch logo | `0 0 24 24` | 36×36 | filled | filled brand | OK |
| 67 | `Onboarding.jsx` | 20 | star | `0 0 24 24` | 36×36 | 2.2 outline | outline | OK |
| 68 | `Onboarding.jsx` | 32 | chat-bubble | `0 0 24 24` | 36×36 | 2.2 outline | outline | OK |
| 69 | `Onboarding.jsx` | 44 | clock-arc | `0 0 24 24` | 36×36 | 2.2 outline | outline | OK |
| 70 | `ChannelSearch.jsx` | 98 | search (header) | `0 0 24 24` | 18×18 | 2.2 outline | outline | OK |
| 71 | `ClipPlayer.jsx` | 31 | twitch logo watermark | `0 0 100 80` | 120×120 | filled | custom | OK — decorative brand |
| 72 | `ClipPlayer.jsx` | 34 | info-circle (error) | `0 0 24 24` | 32×32 | 2.2 outline | outline | OK |
| 73 | `ClipPlayer.jsx` | 75 | close | `0 0 24 24` | 18×18 | 2.2 outline | outline | OK |
| 74 | `ClipPlayer.jsx` | 92 | play (clip placeholder) | `0 0 24 24` | 28×28 | filled | filled | OK |
| 75 | `App.jsx` (titlebar extra) | — | — | — | — | — | — | (ver líneas 77,80,83 arriba) |

> **Nota:** los SVG que son logo Twitch (path `M11.571 4.714…`) y los que son watermark están bien como filled brand assets. No se tocan.

---

## 3. FASE 2 — Análisis de calidad

### 3.1 Resumen de inconsistencias detectadas

| Categoría | Valores encontrados | Consenso ideal | Acción |
|----------|---------------------|----------------|--------|
| `viewBox` | `0 0 12 12`, `0 0 24 24`, `0 0 30 30`, `0 0 100 80`, `0 0 512 512` | `0 0 24 24` (estándar) | Estandarizar |
| `width/height` | 10, 11, 12, 14, 15, 16, 18, 19, 20, 22, 24, 28, 32, 36, 42, 120 | 16 (UI) · 20 (controls) · 24 (player) | Estandarizar |
| `stroke-width` | 1.2, 1.3, 2, 2.2, 2.4, 2.5, 28 | 2 (Lucide) | Estandarizar |
| `fill` | `currentColor` (90%) · `none` (60%) · `white` (1) | `currentColor` + `fill="none"` para outline | Mantener |
| `stroke-linecap/linejoin` | mixto: algunos `round` algunos nada | siempre `round` y `linejoin="round"` | Añadir donde falta |
| `aria-label` | Presente en algunos, ausente en otros | todos los iconos con función deben tener `aria-label` en el `<button>` | Auditoría |
| Estilo mixto | filled (play, pause, star filled, twitch logo) + outline (resto) | outline por defecto, filled solo para estados activos y brand | OK (convención) |

### 3.2 Patrones problemáticos

**A) `viewBox` 512 con `stroke-width="28"`** (líneas 37, 38, 39 de `VideoPlayer.jsx`):
- TheIcon, ClipIcon, VodIcon fueron copiados de un set con grid 512px sin normalizar a la rejilla 24px.
- Resultado: en render real a 19-20px lucen gruesos y fuera de proporción con el resto.
- Impacto: ALTO — son 3 iconos críticos del reproductor.

**B) `viewBox` 30** (líneas 40, 91, 974):
- SettingsIcon copiado tres veces desde la misma fuente. El set original usa grid 30 en lugar de 24.
- Es el icono con MÁS copias de la app: 3 instancias del mismo path.
- Impacto: ALTO — es un icono de altísimo uso.

**C) `play` filled en HeroCarousel vs play filled en VideoPlayer** (líneas 323 vs 32):
- Mismo path, mismo viewBox, mismo `fill="currentColor"`. Solo cambia el tamaño.
- Es OK que sean filled (convención media player), pero convendría extraer un componente `<PlayIcon size="14" />` para DRY.

**D) `coin` filled-circle repetido 3 veces** (líneas 110, 118, 325 en channelpoints/*):
- Mismo SVG literal: `<circle cx="12" cy="12" r="10" />` en 3 archivos.
- Es el placeholder más flojo del set — un círculo plano no comunica "moneda / channel points".
- Impacto: MEDIO.

**E) `x-close` repetido 8+ veces** (líneas 18, 23, 32, 63, 75, 110, 194, 214, 757, 842, …):
- Mismo path literal `<path d="M18 6L6 18M6 6l12 12" />` copy-paste 10+ veces.
- Impacto: ALTO en mantenibilidad.

---

## 4. FASE 3 — Scouting de reemplazos

> **Nota sobre el sitio:** El endpoint `/es/buscar/<keyword>` de icon-icons.com retorna 403/404 a scrapers no autenticados. Pack pages (`/es/pack-de-iconos/<slug>/<id>`) sí son accesibles — verificado en `/es/packs-de-iconos` (índice con 5.342 packs) y en `/es/pack-de-iconos/herramientas-de-construccion-y-carpinteria/6103` (detalle OK). El sitio indexa packs premium; los iconos individuales requieren auth.
>
> **Pivote:** Para producir recomendaciones usables, documento reemplazos desde sets open-source bien establecidos (Lucide, Heroicons, Phosphor) cuyas URLs públicas son scrapeables y que el usuario puede descargar y/o usar vía `lucide-react`. Cito los nombres reales de los iconos para que el reemplazo sea 1:1 con el código actual.

### 4.1 Sets candidatos

| Set | URL | Estilo | Licencia | Veredicto |
|-----|-----|--------|----------|-----------|
| **Lucide** | https://lucide.dev | Outline 2px, 24×24, `currentColor` | ISC (open) | ✅ **Recomendado** — encaja con el 90% del código actual |
| Heroicons | https://heroicons.com | Outline 1.5px / Solid 24×24 | MIT | ⚠️ Stroke 1.5 — más fino que el actual |
| Phosphor | https://phosphoricons.com | 6 variantes (thin/light/regular/bold/fill/duotone) | MIT | ⚠️ Variedad útil pero introduce complejidad |
| Tabler | https://tabler-icons.io | Outline 2px, 24×24 | MIT | ⚠️ Alternativa válida, mismo nicho que Lucide |
| icon-icons.com (libre) | https://icon-icons.com/es/packs-de-iconos | Varios | Free + Premium mixto | ❌ Auth-gated para descarga individual |

### 4.2 Set recomendado: **Lucide**

**Razones:**
1. **Mismo lenguaje visual** que el código actual: outline, stroke 2, viewBox 24, `stroke-linecap="round"`, `stroke-linejoin="round"`, `fill="none"`, `stroke="currentColor"`.
2. **Tree-shakeable** — instalar `lucide-react` da componentes individuales, bundle pequeño.
3. **Mantenido** — fork vivo de Feather Icons, comunidad grande.
4. **Cobertura 1:1** — Lucide tiene ~1500 iconos; todos los que usa BlinkStream existen.
5. **No requiere reescritura** — los SVGs inline se pueden ir migrando componente a componente sin bloqueo.

### 4.3 Tabla de reemplazos propuestos (por icono actual)

| Función | Componente / línea | Set actual | Reemplazo Lucide | URL | Por qué |
|---------|--------------------|------------|------------------|-----|---------|
| settings (gear) | App.jsx:91 · VideoPlayer:40 · Chat:974 | path inline `viewBox 30`, 3 copias | `<Settings />` lucide-react | https://lucide.dev/icons/settings | Estandariza viewBox 24, elimina 3 duplicados |
| close / x | HomeScreen:194,842 · VideoPlayer:63,757 · Chat/settings/etc (10+) | path inline `M18 6L6 18M6 6l12 12`, 10+ copias | `<X />` lucide-react | https://lucide.dev/icons/x | DRY, mismo path pero un componente |
| theatre | VideoPlayer:37 | `viewBox 512`, `stroke 28` | `<TvMinimal />` lucide-react | https://lucide.dev/icons/tv-minimal | viewBox 24, stroke 2 — encaja con el resto del player |
| clip | VideoPlayer:38 | `viewBox 512`, `stroke 28` | `<Scissors />` o `<Clapperboard />` lucide-react | https://lucide.dev/icons/clapperboard | Mismo problema que theatre |
| vod | VideoPlayer:39 | `viewBox 512`, `stroke 28` | `<Video />` lucide-react | https://lucide.dev/icons/video | Mismo problema |
| refresh | RecordingDrawer:72 | path inline | `<RefreshCw />` lucide-react | https://lucide.dev/icons/refresh-cw | Lucide tiene la versión animada estándar |
| play (Hero) | HomeScreen:323 | filled inline | `<Play />` lucide-react (filled por defecto) | https://lucide.dev/icons/play | DRY, mismo fill que el del player |
| record-dot | VideoPlayer:718 | doble circle inline (feo) | `<CircleDot />` o `<Disc />` lucide-react | https://lucide.dev/icons/circle-dot | Doble circle actual se ve mal a 16px |
| coin (CP) | RedeemModal:118, RewardCard:110, RewardForm:325 | `<circle r="10" />` ×3 copias | `<Coins />` lucide-react | https://lucide.dev/icons/coins | Diferencia 2 monedas (3D look) vs círculo plano |
| search | ChannelSearch:98 · Chat:1209 · ViewerList:104 | path inline ×3 | `<Search />` lucide-react | https://lucide.dev/icons/search | DRY |
| chat-bubble | App.jsx:89,90 · Onboarding:32 | path inline | `<MessageCircle />` lucide-react | https://lucide.dev/icons/message-circle | DRY, semánticamente "message" no "chat" |
| info-circle | HomeScreen:698 · UpdateChecker:46 · ClipPlayer:34 | path inline ×3 | `<Info />` lucide-react | https://lucide.dev/icons/info | DRY |
| star (fav) | StreamInfo:230 · Onboarding:20 | path inline ×2 | `<Star />` lucide-react | https://lucide.dev/icons/star | DRY |
| chevron-left/right | HomeScreen:343,346 | path inline | `<ChevronLeft />` / `<ChevronRight />` lucide-react | https://lucide.dev/icons/chevron-left | DRY |
| chevron-down | HomeScreen:629 | filled path | `<ChevronDown />` lucide-react | https://lucide.dev/icons/chevron-down | Cambiar de filled a outline (consistencia) |
| pip | VideoPlayer:733 | path inline | `<PictureInPicture />` lucide-react | https://lucide.dev/icons/picture-in-picture | DRY |
| fullscreen | VideoPlayer:36 | path inline | `<Maximize />` lucide-react | https://lucide.dev/icons/maximize | DRY |
| external-link | VideoPlayer:730 | path inline | `<ExternalLink />` lucide-react | https://lucide.dev/icons/external-link | DRY |
| volume-high/mute | VideoPlayer:34,35 · 619,694 | path inline | `<Volume2 />` / `<VolumeX />` lucide-react | https://lucide.dev/icons/volume-2 | DRY |
| logout | App.jsx:409 | path inline | `<LogOut />` lucide-react | https://lucide.dev/icons/log-out | DRY |
| help-circle | VideoPlayer:678 | path inline | `<HelpCircle />` lucide-react | https://lucide.dev/icons/help-circle | DRY |
| smile (emote) | Chat:1200 | path inline | `<Smile />` lucide-react | https://lucide.dev/icons/smile | DRY |
| twitch logo (filled) | App.jsx:9,425,714 · Onboarding:8 · ClipPlayer:31 | filled brand | **MANTENER** como brand asset | — | Brand — no se reemplaza |
| paypal (filled) | AboutDialog:19 | filled brand | **MANTENER** | — | Brand |
| min/max/close window | App.jsx:77,80,83 | custom 12×12 grid | **MANTENER** | — | Patrón de titlebar estándar — funciona bien a 10px |

### 4.4 Iconos que NO se tocan (ya están bien)

- `pause` (VideoPlayer:33) — filled, convención estándar de media player
- `circle/dot` GlobalRecordingToggle (líneas 20, 28) — diseño intencional, lleno vs vacío = estados
- Los 4 iconos de tabs de emote picker en Chat:1292-1295 — viewBox 30 es un set distinto pero coherente entre sí (tabs del mismo selector)
- Los 4 iconos del Onboarding — bien diseñados, jerarquía visual correcta
- TitleBar controls — perfectos para su tamaño de 10px
- Twitch brand logos — no se tocan
- El `play` filled en VodPlayer:135, ClipPlayer:92 — convención placeholder

---

## 5. FASE 4 — Plan de reemplazo priorizado

### TOP — ALTA (8 iconos)

1. **settings (gear)** — 3 copias (`App.jsx:91`, `VideoPlayer:40`, `Chat:974`), viewBox 30 inconsistente
   - **Recomendado:** `<Settings />` de Lucide (https://lucide.dev/icons/settings)
   - **Por qué:** mayor duplicación de la app, viewBox fuera de estándar, uso frecuente
   - **Acción:** extraer a `src/components/icons/Settings.jsx` que envuelve `lucide-react`

2. **close (X)** — 10+ copias dispersas
   - **Recomendado:** `<X />` de Lucide (https://lucide.dev/icons/x)
   - **Acción:** refactor masivo — reemplazar todas las copias en un solo PR

3. **theatre (TvMinimal)** — `VideoPlayer:37`, viewBox 512, stroke 28
   - **Recomendado:** `<TvMinimal />` de Lucide
   - **Por qué:** desentonía con todo el resto del player (que ya está bien en viewBox 24)

4. **clip (Clapperboard)** — `VideoPlayer:38`, mismo problema
   - **Recomendado:** `<Clapperboard />` de Lucide

5. **vod (Video)** — `VideoPlayer:39`, mismo problema
   - **Recomendado:** `<Video />` de Lucide

6. **record-dot** — `VideoPlayer:718`, doble circle feo a 16px
   - **Recomendado:** `<CircleDot />` de Lucide (con un dot interior limpio)

7. **coin (Channel Points)** — 3 copias (`RewardCard:110`, `RedeemModal:118`, `RewardForm:325`), círculo plano sin personalidad
   - **Recomendado:** `<Coins />` de Lucide (dos monedas superpuestas)
   - **Por qué:** refuerza identidad visual de la feature de Channel Points

8. **info-circle** — 3 copias (`HomeScreen:698`, `UpdateChecker:46`, `ClipPlayer:34`)
   - **Recomendado:** `<Info />` de Lucide

### MEDIA (5 iconos)

9. **play (Hero CTA "Ver ahora")** — `HomeScreen:323`. Mismo path que `VideoPlayer:32`. Solo cambia tamaño.
   - **Acción:** extraer `<PlayIcon size="14" />` reutilizable. NO requiere cambiar set.
   - **Esfuerzo:** 30 min.

10. **search** — 3 copias (ChannelSearch:98, Chat:1209, ViewerList:104). Mismo path inline.
    - **Acción:** extraer `<SearchIcon size=... strokeWidth=... />` reutilizable.

11. **chat-bubble** — 3 copias (App.jsx:89, 90, Onboarding:32). Variantes `on` / `off`.
    - **Acción:** extraer `<MessageCircleIcon />` y `<MessageCircleOffIcon />`.

12. **star (favorito)** — 2 copias (StreamInfo:230, Onboarding:20).
    - **Acción:** extraer `<StarIcon filled={isFavorite} size=... />`.

13. **refresh** — `RecordingDrawer:72`. Buen icono, pero conviene estandarizar para futuros usos.
    - **Acción:** extraer `<RefreshIcon />`.

### BAJA (cosmético, nice-to-have)

- `chevron-left/right/down` en HomeScreen — convertirlos a componentes DRY
- `volume-high/mute`, `pip`, `fullscreen`, `external-link`, `logout`, `help-circle`, `smile` — todos en `VideoPlayer.jsx` y App.jsx. Refactor cuando se toquen esos archivos por otra razón.

---

## 6. Recomendación final: estrategia de adopción

### Opción A: Instalar `lucide-react` (recomendada)

```bash
pnpm add lucide-react
```

**Pros:**
- 1500+ iconos, tree-shakeable, ISC license
- Componentes React nativos, no requiere wrapper
- Mantenimiento comunitario activo

**Contras:**
- Añade 1 dep (el proyecto ya la tiene listada en algún commit anterior — verificar git log)
- Cambio de paradigma: pasar de SVG inline a componentes

**Esfuerzo:** 1-2 sprints para migrar los 13 iconos prioritarios.

### Opción B: Crear un wrapper local `src/components/icons/`

Crear un set de componentes propios que envuelvan los SVGs de Lucide copiados a mano. Útil si se quiere evitar la dep.

```jsx
// src/components/icons/X.jsx
export function X({ size = 16, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round"
         strokeLinejoin="round" {...props}>
      <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
    </svg>
  )
}
```

**Pros:** 0 deps adicionales. Bundle más pequeño.
**Contras:** Mantenimiento manual. No hay catálogo que descubrir.

**Recomendación:** Empezar con la Opción A (lucide-react real) y, si el bundle crece demasiado, evaluar tree-shaking. Si se decide no añadir deps, la Opción B es perfectamente viable.

---

## 7. Acceptance criteria para la futura implementación

> Esto NO se implementa en este task. Lo dejo para el próximo @jesse o @walter.

- [ ] Un único `<PlayIcon size={n} />` reutilizable, sin duplicación de paths
- [ ] Un único `<SettingsIcon size={n} />`, viewBox 24
- [ ] Los 3 iconos del reproductor con `viewBox 512 stroke 28` migrados a viewBox 24
- [ ] Todos los `close (X)` usando el mismo componente
- [ ] Contraste WCAG AA: validar los iconos amarillos de Channel Points sobre fondo `bg-yellow-400/10`
- [ ] `aria-label` en TODOS los `<button>` que contienen icono (auditoría rápida con grep)
- [ ] `stroke-linecap="round" stroke-linejoin="round"` consistente en todos los outline
- [ ] Sin valores hardcodeados: `stroke="currentColor"` siempre, color via `className`

---

## 8. Verificación de entrega

- [x] FASE 1: 75 iconos catalogados en 22 archivos
- [x] FASE 2: tabla de calidad + 5 patrones problemáticos identificados
- [x] FASE 3: scouting documentado (Lucide recomendado + tabla 1:1 de reemplazos)
- [x] FASE 4: 8 ALTA + 5 MEDIA priorizados
- [x] 0 commits
- [x] 0 push
- [x] NO se modificó ningún archivo del proyecto
- [x] Reporte entregado a @walter

---

## 9. Notas / suposiciones

- **Suposición 1:** El brief mencionó `lucide-react@1.21.0` en `package.json`. Verificado — NO está en `package.json` actual. La conversación previa puede haberlo tenido y se removió. Para la recomendación, asumo que la dirección es adoptar `lucide-react` o un set equivalente.
- **Suposición 2:** El sitio icon-icons.com devuelve 403/404 al scraper cuando se buscan iconos individuales. La estructura `/es/packs-de-iconos/<slug>/<id>` sí funciona. Recomiendo al usuario que navegue manualmente el sitio para confirmar las opciones premium, pero el scouting técnico se hizo contra sets open-source scrapeables (Lucide, Heroicons, Phosphor) que dan URLs concretas y código copy-paste listo.
- **Suposición 3:** Los iconos brand (Twitch logo, PayPal) NO se tocan — son logos registrados, mantener el path original.
- **Suposición 4:** El stroke actual mayoritario es 2.2, no 2.0 estándar de Lucide. Para minimizar diff visual, propongo `strokeWidth={2.2}` como prop por defecto en los wrappers, hasta validar visualmente y decidir si se baja a 2.0.
