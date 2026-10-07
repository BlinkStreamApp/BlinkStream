# Hotfixes y pequeñas mejoras

Los hotfixes estables incrementan PATCH: `1.4.2` → `1.4.3` → `1.4.4`.
El título puede indicar «Hotfix de sesión y marca», sin inventar un canal nuevo.
`1.4.2-a` es una prerelease anterior a `1.4.2`; `1.4.2+hotfix.1` no aumenta
la precedencia. No usar ninguno para actualizar una versión estable instalada.
Referencia: [SemVer](https://semver.org/).

## Alcance

Correcciones compatibles, pulido visual y mantenimiento pequeño usan PATCH.
Nuevas funcionalidades relevantes usan MINOR; cambios incompatibles, MAJOR.
No reemplazar artefactos ni mover tags de versiones ya publicadas.

## Procedimiento

1. Revisar diff y aceptación del usuario; separar otros cambios pendientes.
2. Buscar referencias antes de eliminar recursos. Preservar settings, firma y cookies compartidas.
3. Alinear `package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` (paquete
   `blinkstream`) y `src-tauri/tauri.conf.json`. No fabricar firmas ni editar
   `updater.json`: CI lo genera a partir de los artefactos firmados.
4. Actualizar `RELEASE_NOTES.md`, README, roadmap y `PROJECT_STATE` con estado
   de candidato. Distinguir tests de aceptación real; no anunciar descarga inexistente.
5. Ejecutar frontend tests/lint/build, tests de release y checks nativos pertinentes.
6. Subir el candidato a `master`; esperar calidad, cuatro builds (Windows x64,
   macOS Intel/Apple Silicon y Linux x64), smoke NSIS y manifiesto firmado.
7. Solo tras CI correcto, crear/push del tag `vX.Y.Z` en el SHA validado.
   El workflow vuelve a validar y publica release/latest/manifiesto. Requiere
   autorización de publicación: un hotfix no elimina esta condición.
8. Verificar release público completo, cuatro entradas de updater, versión,
   URLs y firmas contra la clave configurada. Actualizar enlaces de descarga
   y documentación a «publicada» en un commit posterior `[skip ci]`.

## Ejemplo: 1.4.3

- Salida de sesión sin follows/recientes visibles; retorno a bienvenida invitado.
- Pins aislados por cuenta y follows refrescados con cancelación/timeout.
- Logo aprobado e iconos desktop; bienvenida clásica y paleta coherente.
- Sin nuevos servicios, migraciones de base de datos ni rotación de claves.

## Si falla

Antes de publicar: no crear el tag ni cambiar latest/manifiesto; corregir el
candidato y repetir las verificaciones. Después de publicar: detener la
distribución automática de la versión defectuosa usando el manifiesto anterior
verificado, con autorización explícita; no desactivar firmas ni forzar un downgrade.
Usuarios ya actualizados necesitan un nuevo PATCH corregido. No afirmar que
volver el manifiesto instala automáticamente una versión anterior.

Límites y evidencias de instalación: [UPDATER_VERIFICATION.md](UPDATER_VERIFICATION.md).
