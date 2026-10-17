# Portable Python runtime — copyleft source supplement

Runtime: Streamlink Windows portable 8.6.2-1. Reviewed: 2026-10-17.

The original runtime retains notices for all 23 Python distributions. Inspection of
their installed metadata identifies two copyleft packages: pycountry 26.2.16
(LGPL-2.1-only) and certifi 2026.7.22 (MPL-2.0). Other packages' original BSD/MIT/
Apache/public-domain notices remain in their `*.dist-info` directories; this is not
a relicensing of those packages or a legal certification.

## Exact source inputs

- pycountry 26.2.16 official PyPI sdist, SHA256
  `5b6027d453fcd6060112b951dd010f01f168b51b4bf8a1f1fc8c95c8d94a0801`.
- Its `generate.py` from official Git commit
  `4ba3951667c2ed98363a3640c9022cf1b7a59300`, SHA256
  `ab8dd1654ce34561f68ba407aa0f0844f2047e021f6d3b6c7d404d8f8ad601d9`.
  The downloaded file additionally matches Git blob
  `58d6b772474d4df2b4f98926c50687bfb9fda054`.
- iso-codes 4.20.1 original source archive from Debian, SHA256
  `5d551f3ddb32548c4321e9011720fd97751af0107592f79ebffc939bd32f2268`.
  It includes editable `.po` translations and JSON data; the sdist alone contains
  compiled `.mo` files and would not supply all editable translation inputs.
  The version is identified by pycountry's release history and `REVISION` in its
  generator. Hash/size agree with Debian's `iso-codes_4.20.1-1.dsc` fetched over HTTPS;
  the Debian PGP signature was not independently validated here.
- certifi 2026.7.22 official PyPI sdist, SHA256
  `741e2c3b351ddf169a738da9f2c048608ff7f2c5cc02f1ebc6b118bb090d5d55`.
  Includes the editable CA bundle, Python code and original MPL notices.

Exact HTTPS locations and hashes are fixed in `scripts/bundle-python-copyleft-sources.ps1`
and copied into the supplement's `source-inventory.json`.

## Build and modification

Sources are supplied separately, not executed by BlinkStream. Extract them into
dedicated unprivileged directories and inspect build scripts first. Preserve all
licenses, copyright notices and translation headers.

For pycountry, use the supplied `pyproject.toml` with its declared `poetry-core`
build backend (`python -m build` in a separately prepared build environment).
The sdist already contains generated JSON/Python/locale files. For editing data
or translations, place iso-codes sources under `parts/data` in the pycountry root,
copy the supplied `generate.py` there, and use Python plus GNU gettext's `msgfmt`
to regenerate those files before building. The original generator fetches and checks
out `v4.20.1`; do not accidentally substitute a moving upstream branch. For an
offline source preparation, initialize the supplied iso-codes tree as a local Git
repository, commit the snapshot, tag it `v4.20.1`, and set its `origin` to that local
repository so the generator's fetch/checkout stays on the supplied snapshot.

For certifi, use its supplied `pyproject.toml`/build configuration and files. Editing
its CA bundle changes trust decisions; verify the consequences before using it.
No upstream generator or package build was executed on the maintainer's Windows host.
This is a source/build map, not an exact-byte wheel rebuild or a compliance opinion.

## Distribution

Prepare once with `scripts/bundle-python-copyleft-sources.ps1`. The supplement is
`BlinkStream-1.5.0-python-copyleft-sources.zip`; preserve it with the original runtime
source companion for every app version that bundles runtime 8.6.2-1. Do not replace
published source archives or duplicate the 2 GB FFmpeg cache for each hotfix.
Publish both source downloads alongside the app's download listing before Store
distribution; a local source archive alone does not establish public availability.

Published supplement: [source download](https://github.com/BlinkStreamApp/BlinkStream/releases/download/v1.5.0/BlinkStream-1.5.0-python-copyleft-sources.zip),
12,561,727 bytes, SHA256 `2601249875bdfb29b66f36fa06f4772c52f29f5f1d19ca1a453a4cdd3d6c2856`.
GitHub asset ID `651274059`; a complete public download streamed to SHA256 matches.
The main runtime source companion is unchanged. Runtime `pycountry/__init__.py`,
`certifi/core.py` and `certifi/cacert.pem` also match their exact sdist files by SHA256.
