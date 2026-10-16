# MSIX runtime provenance and sources

The user authorized bundling on 2026-10-14. Applies only to the Microsoft Store
candidate; GitHub installers retain their existing dependency behavior.

## Runtime

`src-tauri/msix/runtime.json` pins Streamlink Windows portable 8.6.2-1 by official
release URL and SHA256. `prepare-msix-runtime.ps1` checks the digest, prefix,
case-insensitive duplicate paths, traversal, symlinks, required files and bounded
unpacked size before extracting to fresh staging. It never executes downloaded code.
Original layout, Python dependency notices, FFmpeg license and BUILDINFO survive.
The complete runtime is approximately 212 MB unpacked, not committed to Git.

FFmpeg BUILDINFO identifies build-script commit
`7def83d2a56f837b9dbb4b46e0d8b4617fa44cca`; the observed guest version identifies
FFmpeg `9d4ca21220bfd3f06fc8bfc90ddf0f6d0a484611`, configured GPL/version3 with
libx264 and other libraries. Do not describe this binary as LGPL-only.

## Prepare corresponding sources (download only)

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/prepare-msix-sources.ps1
```

Requires curl, tar and authenticated GitHub CLI for public Actions artifacts.
Downloads pinned FFmpeg, CPython and Streamlink source archives, portable/build
scripts, and upstream FFmpeg build run `32120843650` artifact `9318578030`
(`download-cache`, same build commit, about 2 GB). The cache includes dependency
source archives and build inputs; it is not placed inside the MSIX. A complete tar
listing verifies readability and the generated `source-inventory.json` records
local SHA256, sizes and provenance. Hashes of downloaded source archives are an
inventory, not independent upstream signature validation.

Output lives in ignored `src-tauri/target/msix/sources/`. Do not blindly execute
upstream Docker/build scripts or extract their tarballs with elevated privileges.

To assemble the verified local archives and review notes without unpacking them:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/bundle-msix-sources.ps1
```

Output: `target/msix/BlinkStream-1.5.0-runtime-sources.zip` (about 2.12 GB, separate
from the app). Each input is checked against its inventory; the script refuses an
asset over 2 GiB. It does not upload anything. Keep the reviewed corresponding
sources accessible with each distributed binary; do not treat them as disposable
trial binaries during later artifact cleanup.

## Required before public distribution

Technical source correspondence reviewed on 2026-10-17:
[72 enabled options, original build scripts/cache and inventory checks](../reviews/MSIX_SOURCE_CORRESPONDENCE.md).
The single runtime source companion is retained for 1.5.0/1.5.1/1.5.2; app/runtime
notices now identify its exact v1.5.0 download URL and SHA256. Public availability
and the complete public bytes were verified on 2026-10-17 (HTTP 200 and SHA256 match).
No exact offline rebuild or legal
certification is claimed. The remaining requirements below remain distributor duties.

- Review the actual FFmpeg configure line against every enabled library, its exact
  source snapshot, patches and build instructions in the upstream scripts/cache.
- Preserve all copyright and license notices, including Python wheels/native modules.
- Review dependency cache completeness; mere availability of upstream URLs is not a
  completed corresponding-source distribution or proof of reproducibility.
- Publish reviewed sources with accessible build instructions alongside the binary,
  replace candidate-only notices with accurate distribution links, and add an
  accessible third-party notice in the app/website. No binding written source offer
  or legal assurance is invented here.
- Do not submit to Store until the installed runtime and package behavior pass the
  gates in [MSIX_STORE.md](MSIX_STORE.md), and license/source review is closed.

References: [official portable distribution](https://github.com/streamlink/windows-builds),
[FFmpeg legal guidance](https://ffmpeg.org/legal.html).
