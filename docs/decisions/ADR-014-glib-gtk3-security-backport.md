# ADR-014: Backport de seguridad GLib compatible con GTK3

Status: Accepted
Date: 2026-10-07

## Context

El usuario exige cerrar Windows, macOS y Linux antes de publicar 1.4.2.
GTK3/Tauri requieren GLib 0.18; Dependabot no puede resolver >=0.20.0 sin cambiar esa cadena.
La rama oficial 0.18 aún contiene el fallo de `VariantStrIter` descrito en
[GHSA-wrw7-89jp-8q8g](https://github.com/advisories/GHSA-wrw7-89jp-8q8g).

## Decision

Vendorizar el paquete registry GLib 0.18.5 y aplicar únicamente el arreglo oficial de
[gtk-rs-core#1343](https://github.com/gtk-rs/gtk-rs-core/pull/1343), merge
`05dff0ee696f9bcd8617cd48c4b812d046d440cb`: puntero mutable y argumento `&mut p`.
Cargo usa `[patch.crates-io]`; no falsificamos la versión del paquete ni cambiamos su API.
Se conservan sus 121 archivos, COPYRIGHT y licencia MIT.

SHA-256 del `.crate` original, contrastado con Cargo.lock antes de parchear:
`233daaf6e83ae6a12a52055f568f9d7cf4671dabb78ff9560ab6da230ce00ee5`.
La copia solo difiere en `src/variant_iter.rs`. `scripts/verify-glib-backport.mjs`
comprueba la huella exacta del árbol parcheado; `.gitattributes` conserva sus bytes.
CI ejecuta regresiones de iteración en Linux con optimizaciones de release, además del
build real de GTK/Tauri y las pruebas normales. Windows/macOS no incorporan GLib al target.

## Options considered

- Forzar GLib 0.20: incompatible; una segunda versión no corrige los consumidores GTK3.
- Migrar GTK/Tauri o mantener un fork remoto: amplía innecesariamente el cambio y su superficie.
- Excluir Linux: rechazado por el usuario.
- Backport local exacto: pequeño cambio funcional, reproducible y revisable.

## Consequences

Se añade una dependencia vendorizada temporal cuya integridad debe mantenerse.
Dependabot puede seguir señalando 0.18.5 por la versión; no cerrar ni ignorar globalmente la
alerta. Documentar el backport y su validación, no afirmar que el upstream está actualizado.
Retirar el patch/vendor cuando GTK/Tauri resuelvan una versión oficial corregida compatible.
Los tests no reemplazan una validación de escritorio Linux real; el gate optimizado debe pasar
antes de publicar. No hay aceptación silenciosa de la versión vulnerable original.
