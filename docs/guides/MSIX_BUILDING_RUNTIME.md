# Bundled runtime: source and build map

Applies to BlinkStream 1.5.0 MSIX, portable runtime 8.6.2-1. The tools are unmodified
upstream executables launched as separate processes. Source archives are shipped
in the separate `BlinkStream-1.5.0-runtime-sources.zip`; SHA256 values and upstream
locations are in `source-inventory.json`. This is not a claim of bit-for-bit
reproducibility or a replacement for each component's license.

## Contents

- `ffmpeg-source.tar.gz`: FFmpeg commit `9d4ca21220bfd3f06fc8bfc90ddf0f6d0a484611`.
- `ffmpeg-build-scripts.tar.gz`: Streamlink FFmpeg-Builds commit
  `7def83d2a56f837b9dbb4b46e0d8b4617fa44cca`, including dependency scripts and patches.
- `ffmpeg-dependencies/cache.tar.gz`: upstream download-cache artifact 9318578030
  from run 32120843650, associated with that build commit; 226 entries.
- `python-source.tar.gz`: CPython commit `8e6e75d9102e39bed2a2b279203a396741180f12`.
- `streamlink-source.tar.gz`: Streamlink commit `f33007410e7a2b5717a095a23b4978f774a1493a`.
- `portable-build-scripts.tar.gz`: Streamlink windows-builds tag `8.6.2-1`.

Verify archive hashes before unpacking into a dedicated unprivileged directory.
Inspect all scripts before executing them. None was executed on the user's PC.

## FFmpeg build entry points

The exact scripts/patches are in the build-scripts archive. The upstream workflow
`.github/workflows/build.yml` defines image construction, dependency download-cache
restoration and target builds. The relevant target is `win64`, variant `gpl`, addin
`9.0`. Follow `generate.sh`, `makeimage.sh`, `images/base-win64/`, `scripts.d/`,
`variants/win64-gpl.sh`, `variants/defaults-gpl.sh` and `addins/9.0.sh` in that snapshot.
The cache unpacks to `.cache/downloads/` relative to the build-script root.

The upstream build sequence uses a Linux Docker build environment, generates the
target Dockerfile with `./generate.sh win64 gpl 9.0`, constructs the toolchain and
dependency images as specified by the workflow, then invokes
`./build.sh win64 gpl 9.0`. These are upstream entry points, not a verified offline
rebuild recipe. Image tags and branch references can move: do not substitute today's
`release/9.0` HEAD for the pinned FFmpeg source. `build.sh` clones a branch by default;
an exact-source rebuild must use the supplied snapshot through a local Git repository
and `FFMPEG_REPO_OVERRIDE`/`GIT_BRANCH_OVERRIDE`, not a floating upstream checkout.

The shipped `runtime/streamlink/ffmpeg/BUILDINFO.txt` records GPL/version3 and the
build-script commit. The observed guest binary reports GCC 15.2.0, crosstool-NG
1.28.0.23_185f348 and build date 20260818. It enables libx264 and other libraries:
this is a GPL build, not an LGPL-only build. The complete observed configure line
is preserved separately as `FFMPEG_CONFIGURATION.txt` in the source companion.

## Python and Streamlink

For CPython Windows build options use `PCbuild/readme.txt` and the files under
`PCbuild/` in the supplied CPython snapshot. For Streamlink use its supplied
`pyproject.toml`, source and license. The portable Windows assembly and embedded
Python/dependency selection are defined by the supplied windows-builds scripts
and workflow at tag `8.6.2-1`. Preserve the original package layout and all
`*.dist-info` licenses/copyright notices; BlinkStream does not relink these tools.

## Distribution boundary

The source companion is prepared locally, not automatically published. Before public
app distribution, review every enabled library against the cache/scripts and make
the companion persistently downloadable by recipients; provide its actual URL in
the app/download listing. Do not invent a published URL or a written source offer.
Packaging checks and archive integrity do not certify legal compliance or Store
acceptance. Source publication remains separate from generating the MSIX.
