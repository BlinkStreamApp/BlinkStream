# Hotfixes y pequeñas mejoras

Los hotfixes estables incrementan PATCH: `1.4.2` → `1.4.3` → `1.4.4`.
El título puede indicar «Hotfix de sesión y marca», sin inventar un canal nuevo.
`1.4.2-a` es una prerelease anterior a `1.4.2`; `1.4.2+hotfix.1` no aumenta
la precedencia. No usar ninguno para actualizar una versión estable instalada.
Referencia: [SemVer](https://semver.org/).

## Alcance

Regla de producto acordada el 2026-10-13: correcciones, pulido visual y ampliaciones
incrementales compatibles se entregan en PATCH consecutivos, sin saltar a MINOR
por cada mejora. Reservar MINOR para una entrega de mayor alcance aprobada por el usuario;
los cambios incompatibles requieren revisar MAJOR. Esto no redefine SemVer para APIs públicas.
No reemplazar artefactos ni mover tags de versiones ya publicadas.

Tras las pruebas pertinentes, subir cada cambio terminado como hotfix o actualización.
La autorización permanente del usuario cubre el flujo normal de commit/push/release tras
validación; no cubre instalar en su PC, desplegar Supabase, cambiar permisos/secretos ni
publicar con checks fallidos. Una petición posterior de «solo local» suspende ese flujo.

## Procedimiento

1. Revisar diff y aceptación del usuario; separar otros cambios pendientes.
2. Buscar referencias antes de eliminar recursos. Preservar settings, firma y cookies compartidas.
3. Alinear `package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` (paquete
   `blinkstream`) y `src-tauri/tauri.conf.json`. No fabricar firmas ni editar
   `updater.json`: CI lo genera a partir de los artefactos firmados.
4. Actualizar `RELEASE_NOTES.md`, README, `ROADMAP.md`, roadmap/web `docs/index.html`
   y `PROJECT_STATE` con estado
   de candidato. Distinguir tests de aceptación real; no anunciar descarga inexistente.
5. Ejecutar frontend tests/lint/build, tests de release y checks nativos pertinentes.
6. Subir el candidato a `master`; esperar calidad, cuatro builds (Windows x64,
   macOS Intel/Apple Silicon y Linux x64), smoke NSIS y manifiesto firmado.
7. Solo tras CI correcto, crear/push del tag `vX.Y.Z` en el SHA validado.
   El workflow vuelve a validar y publica release/latest/manifiesto. Requiere
   autorización de publicación. La regla permanente del usuario del 2026-10-13
   permite este flujo después de las pruebas, salvo restricciones posteriores.
8. Verificar release público completo, cuatro entradas de updater, versión,
   URLs y firmas contra la clave configurada. Actualizar enlaces de descarga
   y documentación a «publicada» en un commit posterior `[skip ci]`.
   Confirmar el despliegue de Pages. `pnpm test:release` debe pasar también en ese commit:
   verifica que README, notas, roadmap y marcador de versión de la web no quedaron antiguos.

## Ejemplo: 1.4.3

- Salida de sesión sin follows/recientes visibles; retorno a bienvenida invitado.
- Pins aislados por cuenta y follows refrescados con cancelación/timeout.
- Logo aprobado e iconos desktop; bienvenida clásica y paleta coherente.
- Sin nuevos servicios, migraciones de base de datos ni rotación de claves.

## Si falla

El hook escanea archivos completos y puede marcar `supabase-url` al cambiar solo
la versión en `tauri.conf.json`. La URL pública de la CSP no es una credencial
(clasificación en `docs/SECURITY.md`). Verificar que el diff no introduce URLs ni
tokens y documentar el falso positivo antes de usar `BLINKSTREAM_SCAN_ALLOW=supabase-url`
solo para ese commit. Mantener todas las reglas de JWT/claves privadas/tokens activas;
no usar `BLINKSTREAM_SKIP_SCAN` ni cambiar la CSP para sortear el hook.

Antes de publicar: no crear el tag ni cambiar latest/manifiesto; corregir el
candidato y repetir las verificaciones. Después de publicar: detener la
distribución automática de la versión defectuosa usando el manifiesto anterior
verificado, con autorización explícita; no desactivar firmas ni forzar un downgrade.
Usuarios ya actualizados necesitan un nuevo PATCH corregido. No afirmar que
volver el manifiesto instala automáticamente una versión anterior.

Límites y evidencias de instalación: [UPDATER_VERIFICATION.md](UPDATER_VERIFICATION.md).
