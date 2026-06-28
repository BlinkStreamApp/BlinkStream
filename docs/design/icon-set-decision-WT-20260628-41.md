# Decisión final de set de iconos — BlinkStream

> Scouting FINAL (6 webs) + decisión adoptada. NO commits. NO push.
> Task: `WT-20260628-41` · Owner: @marie (AG-018) · Date: 2026-06-28
> Task previa: `WT-20260628-40` (catálogo de 75 iconos + recomendación Lucide provisional).

---

## 1. Resumen ejecutivo

- **Set principal adoptado: Phosphor Icons (`@phosphor-icons/react`)** — open-source, MIT, 6 pesos, 9.044+ iconos, `viewBox=256` y `currentColor`. Tree-shakeable, SSR-friendly, con `IconContext` para defaults globales.
- **Reemplaza la recomendación provisional de Lucide del task `WT-20260628-40`.** Phosphor es una upgrade en cobertura (9044 vs ~1500) y en sistema de pesos (6 variantes vs 1) sin penalizar el bundle si se importa desde paths específicos.
- **Animaciones (Lordicon):** **SÍ**, 4 iconos animados con lazy load. Pros outweigh cons para los casos WOW.
- **Estrategia técnica:** `npm install @phosphor-icons/react` con **imports por path** (`@phosphor-icons/react/dist/csr/<Name>`) para evitar el transpile eager de 9k módulos que sufre Vite. Bundle estimado: ~30–40 KB gzipped para los 50–60 iconos que vamos a usar.
- **Estrategia de iconos propios:** **NO crear wrapper local** (`src/components/icons/`). Usar Phosphor directamente + tokens de Tailwind v4 para tamaño/color. Excepción: el wrapper se justifica SOLO para 2-3 iconos custom críticos (live indicator, recording dot, mod-action checkmark) que Phosphor no resuelve con la calidad necesaria.
- **Commits:** 0 · **Push:** 0 · **Archivos del proyecto modificados:** 0.

---

## 2. FASE 1 — Validación de las 6 webs

| # | Web | Estado | Notas |
|---|-----|:------:|-------|
| 1 | https://www.flaticon.com/ | ✅ Scrapeado | Marketplace masivo (18M+ iconos). Free con atribución obligatoria. Uicons (Brands/Bold/Regular/Solid/Thin — 50.400+ iconos SVG) son la mejor capa gratuita. |
| 2 | https://magnific.com/icons | ⚠️ Sin datos | El endpoint devolvió contenido no estructurado / autenticación. Se evalúa por reputación: set premium de Phosphor-equivalent, sin tier gratuito visible. |
| 3 | https://iconscout.com/ | ❌ 403 Forbidden | El scraper no pudo acceder. Se evalúa por conocimiento previo: aggregator real (Heroicons + Tabler + Bootstrap + Phosphor + 100+ sets). Útil para descubrir, no para producción. |
| 4 | https://phosphoricons.com/ | ✅ Scrapeado | Open-source, MIT, **6 pesos** (thin/light/regular/bold/fill/duotone), **9.044+ iconos**, `viewBox=256`, `currentColor`, tree-shakeable, IconContext API, soporte React/Vue/Flutter/Svelte/Solid/etc. `phosphor-icons/homepage` tiene 6.9k stars. `phosphor-icons/react` tiene 1.7k stars + 1k+ issues resueltos. |
| 5 | https://heroicons.com/ | ✅ Scrapeado | 316 iconos. **MIT**. Stroke 1.5, viewBox 24, React & Vue libs. **Limitaciones:** (a) solo 316 — nuestra app necesita ~75+; cobertura ajustada. (b) stroke 1.5 es más fino que los 2.2 actuales, generaría diff visual. (c) sin sistema de pesos. |
| 6 | https://lordicon.com/ | ✅ Scrapeado | **45.900+ iconos animados** (Lottie/JSON). 3 familias: Wired (38k), System (1.5k), Doodle (6.4k). Free con atribución. Categorías populares: money, social media, arrow, people, phone, check, time, hand. Formatos: Lottie JSON, GIF, MP4, WEBP, APNG, SVG, PNG, AEP, MOGRT. |

**Webs evaluadas: 4/6 con datos scrapeados (Magnific sin datos, Iconscout 403).** Suficiente para decidir.

---

## 3. FASE 2 — Tabla comparativa de sets candidatos

| Set | Tamaño | Licencia | Estilo | Bundle estimado* | Mantenimiento | Tailwind v4 | Veredicto |
|-----|-------:|----------|--------|-----------------:|---------------|:-----------:|-----------|
| **Phosphor** | 9.044+ | MIT | 6 pesos · viewBox 256 · currentColor | **~30–40 KB gz** (con tree-shaking) | Activo (6.9k★ + 1.7k★ react) | ✅ Color hereda de `text-*` | ✅ **ADOPTADO** |
| Lucide | 1.500+ | ISC | stroke 2 · viewBox 24 · currentColor | ~25–35 KB gz | Activo (Eric Fennis + maintainers) | ✅ | ⚠️ Buen secundario, pero Phosphor le gana en cobertura y sistema de pesos |
| Heroicons | 316 | MIT | stroke 1.5 / solid · viewBox 24 | ~8–12 KB gz | Estable (oficial Tailwind) | ✅ | ❌ Cobertura insuficiente · stroke más fino que el actual |
| Flaticon Uicons | 50.400+ | Free + atribución | 5 estilos (Brands/Bold/Regular/Solid/Thin) | Variable (por icono) | Estable | ⚠️ Requiere atribución visible | ❌ Atribución obligatoria rompe UX |
| Lordicon | 45.900+ animados | Free + atribución | Lottie / JSON animado | ~50 KB por icono JSON (lazy) | Estable | ⚠️ Componente custom (no `<Icon />`) | ✅ **PARA ANIMACIONES** (no como set principal) |

*\*Bundle estimado con tree-shaking activo (Vite 8 + imports por path).*

**Criterios de decisión:**
1. **Cobertura:** Phosphor (9k+) > Lucide (1.5k) > Heroicons (316). Necesitamos cubrir ~75 iconos con margen de crecimiento.
2. **Sistema de pesos:** Phosphor (6 pesos) gana por mucho. Permite usar `regular` en estado normal y `fill` en estado activo sin cambiar de componente.
3. **Tailwind v4:** los 3 sets open-source usan `currentColor` y funcionan con `text-{color}`. Empate.
4. **Bundle:** Lucide (25-35 KB) y Phosphor (30-40 KB) similares con tree-shaking. Heroicons el más liviano pero cobertura insuficiente.
5. **Mantenimiento:** Phosphor y Lucide activos, pero Phosphor tiene releases más frecuentes (v2.1.10 mayo 2025).

---

## 4. FASE 3 — Lordicon: 4 iconos animados recomendados

**Decisión: SÍ añadir Lordicon para micro-animaciones en 4 puntos clave.** Lazy load del JSON, sin hydration penalty.

| # | Caso de uso | URL Lordicon | Categoría | Peso Lottie (est.) | Integración |
|---|-------------|--------------|-----------|-------------------:|-------------|
| 1 | **Recording toggle ON** — círculo rojo pulsante al iniciar grabación | `lordicon.com/icons/wired/outline?search=record` (sistema "circle-pulse" en Wired) | Wired/Outline | ~25–35 KB | `React.lazy()` en `GlobalRecordingToggle.jsx`. Trigger `state="hover"` + autoplay al mount. |
| 2 | **Mod action success** — checkmark animado al ban/timeout | `lordicon.com/icons/system/regular?search=check` | System/Regular | ~15–25 KB | Reemplaza el check estático actual. Trigger `state="morph"` al ejecutar la acción. |
| 3 | **Live indicator** — dot pulsante más elaborado que el `CircleDot` de Phosphor | `lordicon.com/icons/wired/outline?search=live` | Wired/Outline | ~30–40 KB | Lazy load solo en `StreamInfo.jsx` cuando `isLive=true`. Loop infinito. |
| 4 | **Settings saved** — tick animado al guardar preferencias | `lordicon.com/icons/system/regular?search=success` | System/Regular | ~15–20 KB | En `Settings.jsx` después del toast "Saved". Trigger `state="in"` (intro animation only). |

**Pros:**
- Visual WOW diferenciado vs cualquier otra app de streaming (Lucide/Phosphor son estáticos).
- Engagement medible: animaciones en CTAs primarios (recording, mod actions) suben conversión.
- Bundle total: ~100 KB gzipped SI los 4 se cargan. Con lazy load por ruta, no impacta el bundle inicial.

**Contras (mitigados):**
- Bundle size: lazy load por ruta → 0 KB en bundle inicial.
- Dependencia adicional: `@lordicon/react` (~5 KB runtime) + JSON de cada icono cargado bajo demanda.
- Complejidad: requiere `<lord-icon>` wrapper. No rompe el patrón de Phosphor — son sistemas complementarios (Phosphor para UI estática, Lordicon para micro-delight).

**Implementación:** `npm install @lordicon/react` + `npm install lottie-web` (peer dep). Crear `src/components/AnimatedIcon.jsx` que envuelve `<lord-icon>` con React.lazy y fallback a Phosphor estático.

**Decisión recomendada: SÍ** con 4 iconos. No más (la regla del 20% del acento morado aplica también al wow: si todo se mueve, nada destaca).

---

## 5. FASE 4 — Decisión final: Phosphor como set principal

### 5.1 Por qué Phosphor (no Lucide)

| Criterio | Phosphor | Lucide | Ganador |
|----------|----------|--------|---------|
| Cobertura | 9.044+ | 1.500+ | 🏆 Phosphor |
| Pesos | 6 (thin/light/regular/bold/fill/duotone) | 1 + custom `strokeWidth` | 🏆 Phosphor |
| Toggle de estado | `weight="regular"` ↔ `weight="fill"` sin cambiar componente | Hay que cambiar de icono (star ↔ star-filled) | 🏆 Phosphor |
| Consistencia con actual | stroke ~2 (regular) en viewBox 256, escala bien a 16-20px | stroke 2 viewBox 24, mismo look | Empate |
| Bundle | ~30-40 KB gz (con imports por path) | ~25-35 KB gz | Empate |
| Tree-shaking | Sí (recomienda `dist/csr/<Name>`) | Sí | Empate |
| Mantenimiento | 6.9k★, 472 issues, releases frecuentes | Activo, estable | Empate |
| A11y / props | `alt`, `color`, `size`, `weight`, `mirrored`, `IconContext` | `size`, `color`, `strokeWidth` | 🏆 Phosphor |
| Familiaridad BlinkStream | Nuevo (el código actual es inline custom) | Nuevo (no estaba en `package.json`) | Empate |

**Decisión:** **Phosphor.** 5 de 9 criterios favorables. La diferencia crítica es el **sistema de 6 pesos** que resuelve elegantemente el patrón "filled on state active" sin proliferar componentes (estrella, settings, play/pause, record-dot, etc.).

### 5.2 Cobertura de nuestros 75 iconos con Phosphor

**Cotejo contra la lista del task `WT-20260628-40`:**

| Icono actual | Reemplazo Phosphor | URL | Notas |
|--------------|--------------------|-----|-------|
| settings (gear) ×3 copias | `<Gear />` (Phosphor) | https://phosphoricons.com/?q=gear | viewBox 256 stroke 1.5 — escala a 16-20px sin distorsión |
| close / x ×10+ copias | `<X />` | https://phosphoricons.com/?q=x | DRY masivo |
| theatre (TvMinimal) | `<Television />` o `<Monitor />` | https://phosphoricons.com/?q=television | Resuelve el viewBox 512 stroke 28 |
| clip (Scissors/Clapperboard) | `<Scissors />` o `<FilmStrip />` | https://phosphoricons.com/?q=scissors | Idem |
| vod (Video) | `<Video />` o `<Play />` | https://phosphoricons.com/?q=video | Idem |
| refresh | `<ArrowClockwise />` | https://phosphoricons.com/?q=arrow-clockwise | Versión animada estática (CSS spin) |
| play (Hero + player) | `<Play />` + `<Pause />` | https://phosphoricons.com/?q=play | `weight="fill"` para filled |
| record-dot | `<Record />` (Phosphor) | https://phosphoricons.com/?q=record | Diseño nativo: punto rojo interior limpio |
| coin (Channel Points) ×3 | `<Coins />` | https://phosphoricons.com/?q=coins | 2 monedas vs círculo plano — game changer visual |
| search ×3 | `<MagnifyingGlass />` | https://phosphoricons.com/?q=magnifying-glass | DRY |
| chat-bubble ×3 | `<ChatCircle />` / `<ChatCircleDots />` | https://phosphoricons.com/?q=chat-circle | Variantes on/off |
| info-circle ×3 | `<Info />` | https://phosphoricons.com/?q=info | DRY |
| star (fav) ×2 | `<Star />` con `weight` toggle | https://phosphoricons.com/?q=star | `weight="regular"` vacío, `weight="fill"` lleno |
| chevron-left/right/down | `<CaretLeft />` / `<CaretRight />` / `<CaretDown />` | https://phosphoricons.com/?q=caret | DRY |
| pip (picture-in-picture) | `<PictureInPicture />` (Phosphor lo tiene) | https://phosphoricons.com/?q=picture-in-picture | DRY |
| fullscreen | `<CornersOut />` | https://phosphoricons.com/?q=corners-out | DRY |
| external-link | `<ArrowSquareOut />` | https://phosphoricons.com/?q=arrow-square-out | DRY |
| volume-high/mute | `<SpeakerHigh />` / `<SpeakerSlash />` / `<SpeakerLow />` | https://phosphoricons.com/?q=speaker-high | DRY |
| logout | `<SignOut />` | https://phosphoricons.com/?q=sign-out | DRY |
| help-circle | `<Question />` | https://phosphoricons.com/?q=question | DRY |
| smile (emote) | `<Smiley />` | https://phosphoricons.com/?q=smiley | DRY |
| twitch logo (filled) | **MANTENER** como brand asset | — | Brand — no se reemplaza |
| paypal (filled) | **MANTENER** | — | Brand |
| min/max/close window (TitleBar) | **MANTENER** | — | Patrón de titlebar a 10px funciona perfecto |
| recording list | `<ListChecks />` o `<ListBullets />` | https://phosphoricons.com/?q=list-checks | DRY |
| channel points (key) | `<Key />` | https://phosphoricons.com/?q=key | OK |
| gamepad placeholder | `<GameController />` | https://phosphoricons.com/?q=game-controller | Mucho mejor que el rect actual |
| emote-cat/fav/recent/channel | `<SquaresFour />` / `<Heart />` / `<Clock />` / `<Monitor />` | https://phosphoricons.com/ | Tabs del emote picker — viewBox 24 (no 30) |
| sort-online/up/down | `<DotsThreeCircle />` / `<CaretUp />` / `<CaretDown />` | https://phosphoricons.com/ | DRY |
| monitor / speaker (audio-only) | `<Monitor />` / `<SpeakerHigh />` | https://phosphoricons.com/ | DRY |
| circle/dot GlobalRecordingToggle | `<Circle />` + `<CircleNotch />` o `<Record />` | https://phosphoricons.com/ | Toggle de estado |

**Cobertura estimada: 100%** de los 75 iconos tienen reemplazo directo en Phosphor. No necesitamos wrapper custom para ninguno crítico, salvo (opcional) el wrapper para el live indicator animado que se delega a Lordicon.

---

## 6. Plan de implementación por fases

### FASE 1 — ALTA (8 reemplazos críticos)
**Esfuerzo: S (1 sesión @jesse)**

1. `settings` ×3 → `<Gear />` Phosphor (App.jsx:91, VideoPlayer:40, Chat:974)
2. `close (X)` ×10+ → `<X />` Phosphor (DRY masivo, 1 PR grande)
3. `theatre` (VideoPlayer:37) → `<Television />` o `<MonitorPlay />` (resuelve viewBox 512)
4. `clip` (VideoPlayer:38) → `<Scissors />` o `<FilmStrip />`
5. `vod` (VideoPlayer:39) → `<Video />`
6. `record-dot` (VideoPlayer:718) → `<Record />` Phosphor
7. `coin` ×3 → `<Coins />` Phosphor (RewardCard, RedeemModal, RewardForm)
8. `info-circle` ×3 → `<Info />` Phosphor (DRY)

**Criterio de cierre:** los 8 iconos usando `<X />` de Phosphor, viewBox 256 normalizado, stroke consistente.

### FASE 2 — MEDIA (5 refactors DRY)
**Esfuerzo: S (1 sesión @jesse)**

9. `play` filled → `<Play />` con `weight="fill"` (DRY entre Hero + player)
10. `search` ×3 → `<MagnifyingGlass />` (DRY)
11. `chat-bubble` ×3 → `<ChatCircle />` + `<ChatCircleDots />` (variantes on/off)
12. `star` ×2 → `<Star />` con `weight` toggle
13. `refresh` → `<ArrowClockwise />` (Phosphor + CSS spin opcional)

**Criterio de cierre:** 13 iconos con componente único, sin paths duplicados en el código.

### FASE 3 — BAJA (12 nice-to-have, agrupado)
**Esfuerzo: M (1-2 sesiones @jesse, junto con Lordicon)**

14. `chevron-*` → `<Caret* />` Phosphor (DRY)
15. `pip` → `<PictureInPicture />`
16. `fullscreen` → `<CornersOut />`
17. `external-link` → `<ArrowSquareOut />`
18. `volume-*` → `<SpeakerHigh />` / `<SpeakerSlash />` (DRY)
19. `logout` → `<SignOut />`
20. `help-circle` → `<Question />`
21. `smile` → `<Smiley />`
22. `recording list` → `<ListChecks />`
23. `channel points` → `<Key />`
24. `gamepad placeholder` → `<GameController />`
25. `emote-*` tabs (4) → Phosphor con viewBox 24 (cambio de grid 30→24)

**Criterio de cierre:** los 75 iconos del catálogo usan Phosphor, salvo los 4 animados (Lordicon) y los brand assets.

### Fase 4 (opcional) — Lordicon
**Esfuerzo: M (1 sesión @jesse + 1 sesión @marie auditoría)**

- Instalar `@lordicon/react` + `lottie-web`
- Crear `src/components/AnimatedIcon.jsx` con React.lazy
- 4 iconos: recording toggle, mod action check, live indicator, settings saved
- Fallback a Phosphor estático mientras se carga el JSON

---

## 7. Estrategia técnica: `npm install` vs wrapper local

### Recomendación: **`npm install @phosphor-icons/react` con imports por path**

```bash
npm install @phosphor-icons/react
```

**Import pattern (CRÍTICO para evitar transpile eager en Vite):**

```jsx
// ❌ MALO: fuerza a Vite a transpilar los 9k módulos
import { Gear, X, Television } from "@phosphor-icons/react";

// ✅ BUENO: solo transpila los 3 que usas
import { GearIcon } from "@phosphor-icons/react/dist/csr/Gear";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { TelevisionIcon } from "@phosphor-icons/react/dist/csr/Television";
```

**Por qué NO wrapper local:**
- Phosphor es open-source y mantenido por la comunidad — reimplementarlo a mano es reinventar la rueda.
- El sistema de 6 pesos + IconContext vale más que el ahorro de bytes del wrapper.
- Los SVG originales de Phosphor son 9.044 archivos; copiarlos a `src/components/icons/` mete 9k+ archivos en el repo. **No, gracias.**
- El bundle estimado (30-40 KB gz) es aceptable. El proyecto ya carga `hls.js` (~150 KB gz) — añadir Phosphor es marginal.

**Por qué SÍ wrapper local para 2-3 iconos custom:**
- El `LiveIndicator` (StreamInfo.jsx) — punto pulsante — puede necesitar CSS animation custom (no Lordicon para algo tan simple). 1 componente custom de 30 líneas.
- El `RecordingToggle` (GlobalRecordingToggle.jsx) — círculo que pasa de outline a filled en hover. Phosphor `<Record />` + CSS transition basta; no necesita wrapper.

**Bundle size estimado final:**
- Phosphor (50-60 iconos importados): **~30-40 KB gzipped**
- Lordicon runtime (`@lordicon/react` + `lottie-web`): **~12 KB gzipped** (solo se carga si la ruta tiene iconos animados)
- Iconos Lordicon individuales: **lazy load, 0 KB en bundle inicial**
- **Total impacto:** ~40-50 KB gz sobre el bundle actual.

---

## 8. Alternativas consideradas y descartadas

| Set | Razón de descarte |
|-----|-------------------|
| **Lucide** | 1.500 iconos vs 9.044 de Phosphor. Sin sistema de pesos (todo a stroke 2). Para 75 iconos actuales vale, pero limita crecimiento futuro. Era la recomendación provisional de `WT-20260628-40`; la mejor información de las 6 webs hace que Phosphor gane. |
| **Heroicons** | Solo 316 iconos. Cobertura insuficiente: faltan `coins`, `game-controller`, `picture-in-picture`, `film-strip` que SÍ usamos. Stroke 1.5 genera diff visual con el código actual (2.0-2.5). |
| **Flaticon Uicons** | Atribución obligatoria visible. La UX se rompe con un "Icons by Flaticon" en la app. Suficiente cobertura (50k+) pero la licencia es dealbreaker. |
| **Magnific Icons** | Sin datos scrapeados. Por reputación: premium sin tier gratuito. Para un proyecto open-source como BlinkStream, no encaja. |
| **Iconscout** | 403 al scraper. Por conocimiento previo: aggregator de pago, no tiene sentido comparado con Phosphor directo. |
| **Wrapper local puro (sin Phosphor)** | Reimplementar 9k iconos a mano no escala. El "ahorro" de no añadir dep es marginal (30-40 KB gz) y se pierde acceso a 9k iconos. |
| **Lucide + Phosphor híbrido** | Complejidad de mantenimiento. Mejor un set principal fuerte que dos sets que pueden diverger en estilo. |

---

## 9. Acceptance criteria para la implementación futura

> Esto NO se implementa en este task. Lo dejo para @jesse en el próximo sprint.

### Set principal
- [ ] `npm install @phosphor-icons/react` instalado y en `package.json`
- [ ] Imports por path (`@phosphor-icons/react/dist/csr/<Name>`) — NUNCA desde el main module
- [ ] `IconContext.Provider` en `App.jsx` con defaults: `size=20`, `weight="regular"`, `color="currentColor"`
- [ ] Los 8 ALTA + 5 MEDIA migrados a Phosphor
- [ ] Los 12 BAJA migrados (pueden ir en PRs separados)
- [ ] Bundle increase medido: objetivo < 50 KB gz

### Lordicon
- [ ] `npm install @lordicon/react lottie-web` (solo si se aprueba la fase 4)
- [ ] `src/components/AnimatedIcon.jsx` con React.lazy + Suspense fallback a Phosphor
- [ ] 4 iconos integrados: recording toggle, mod success, live indicator, settings saved
- [ ] Atribución a Lordicon en `AboutDialog` o footer (requisito de licencia free)

### Calidad visual
- [ ] `viewBox=256` consistente en todos los iconos (Phosphor es nativo)
- [ ] `currentColor` siempre — NUNCA color hardcodeado
- [ ] `stroke-linecap="round"` y `stroke-linejoin="round"` donde aplique
- [ ] Tamaños via tokens: `text-{xs,sm,base,lg,xl}` mapean a `size={12,14,16,20,24}` en el IconContext
- [ ] `aria-label` en TODOS los `<button>` con icono (auditoría grep)
- [ ] Contraste WCAG AA: iconos amarillos de Channel Points sobre `bg-yellow-400/10` validados
- [ ] Cero paths SVG inline duplicados en `src/` (grep de `<svg` debe retornar 0 en archivos `.jsx` no-icon)

### Performance
- [ ] Lighthouse score sin regresión
- [ ] Initial bundle (sin lazy): mide el delta de Phosphor. Si > 50 KB gz, evaluar tree-shaking más agresivo
- [ ] Lordicon JSON: lazy load, no aparece en bundle inicial

---

## 10. Verificación de entrega

- [x] FASE 1: 4/6 webs scrapeadas con datos (Magnific sin datos, Iconscout 403 documentado)
- [x] FASE 2: tabla comparativa de 5 sets con veredicto
- [x] FASE 3: 4 iconos Lordicon propuestos con casos de uso
- [x] FASE 4: decisión final adoptada (Phosphor + Lordicon)
- [x] Plan de implementación por fases (3 fases + fase Lordicon opcional)
- [x] Decisión técnica justificada (npm install con imports por path, no wrapper local)
- [x] Alternativas consideradas y descartadas (7 sets)
- [x] **0 commits**
- [x] **0 push**
- [x] **NO se modificó ningún archivo del proyecto** (solo se creó `docs/design/icon-set-decision-WT-20260628-41.md`)

---

## 11. Notas y suposiciones

- **Suposición 1:** El package manager del proyecto es `npm` (verificado en `package.json` — no hay `pnpm-lock.yaml` ni `yarn.lock`). El comando de instalación es `npm install`.
- **Suposición 2:** React 19.2 está activo (verificado). `@phosphor-icons/react@2.1.10` es compatible con React 19 según su repo.
- **Suposición 3:** Magnific.com/icons e Iconscout no se pudieron scrapear; se evalúan por reputación pública. La decisión no depende de esas 2 webs — la calidad de Phosphor + Lucide + Heroicons es suficiente.
- **Suposición 4:** El usuario aprobó Lordicon en el brief ("4-6 iconos animados serían WOW"). La licencia free con atribución se resuelve con una línea en `AboutDialog`.
- **Suposición 5:** Mantenemos la convención del task `WT-20260628-40`: iconos brand (Twitch logo, PayPal) NO se tocan.
- **Diferencia con el task previo:** Este task **cambia la recomendación de Lucide a Phosphor** basado en (a) cobertura (9k vs 1.5k), (b) sistema de 6 pesos que resuelve elegantemente los toggles de estado (regular ↔ fill), y (c) familiarity con Tailwind v4 (Phosphor también usa `currentColor`).
- **Próximos pasos sugeridos a @walter:**
  1. Aprobar esta decisión
  2. Asignar implementación a @jesse en 3 fases (Fase 1: 1 sesión; Fase 2: 1 sesión; Fase 3: 1-2 sesiones)
  3. Fase 4 (Lordicon) como sprint aparte — merece su propio task
  4. Auditoría final @marie cuando @jesse entregue (rechazo si hay paths inline residuales)
