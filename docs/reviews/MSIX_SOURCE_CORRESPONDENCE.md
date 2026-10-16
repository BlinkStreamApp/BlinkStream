# MSIX runtime source correspondence review

Reviewed: 2026-10-17. Runtime: Streamlink Windows portable 8.6.2-1 (unchanged since MSIX 1.5.0).

## Evidence and boundary

The six source inputs inside the existing source companion were streamed and SHA256-checked against the pinned source inventory; the companion itself is SHA256 `f3bd70b2068668b6cfaa035ad405e1fb4d9b78a3327e90b586884d141befe0db` (2,116,378,839 bytes).
The original upstream dependency cache lists 226 entries, including named aliases and content-keyed snapshots. Every dependency-download script in the pinned build snapshot has a matching keyed cache archive; none was missing. All 72 observed enabled FFmpeg options map below to supplied build scripts/source archives or intrinsic FFmpeg/OS settings. The main FFmpeg snapshot, configuration, patches, build entry points, Python/Streamlink snapshots and original runtime notices are preserved. No upstream scripts were executed on the host.

This closes the local technical inventory/mapping check, not a legal opinion or a bit-for-bit offline rebuild claim. Matching cache names and upstream build provenance do not independently prove every upstream source commit. No exact-source rebuild was executed. Persistent public download and actual in-package/download-page source instructions must be verified separately before declaring distribution complete. The original companion retains the preparation notes from its creation; this review supersedes their pending inventory check, not their historical facts.

## Enabled configuration mapping

`ffmpeg-source.tar.gz` supplies intrinsic FFmpeg code; `ffmpeg-build-scripts.tar.gz` supplies every path below and patches. Each non-skipped script has the keyed source snapshot in `ffmpeg-dependencies/cache.tar.gz`. A dash in the cache column means an intrinsic option or an OS interface requiring no separate downloaded source, not a missing archive.

| Enabled option | Supplied build script | Pinned source revision(s) | Keyed cache entries |
| --- | --- | --- | --- |
| `--enable-gpl` | FFmpeg intrinsic | FFmpeg pinned snapshot | — |
| `--enable-version3` | FFmpeg intrinsic | FFmpeg pinned snapshot | — |
| `--enable-pthreads` | FFmpeg intrinsic | FFmpeg pinned snapshot | — |
| `--enable-iconv` | `scripts.d/20-libiconv.sh` | `5e517e5bf0e1b4575ad431e81d7a4750fa2b284e`, `09b1597470c456aeac7e7d19b214821d4526934d` | 1 |
| `--enable-zlib` | `scripts.d/20-zlib.sh` | `e3dc0a85b7032e98380dec011bc8f2c2ee0d8fca` | 1 |
| `--enable-libxml2` | `scripts.d/25-libxml2.sh` | `c63248941708bc1d2e3a4292954593312212f6ca` | 1 |
| `--enable-libvmaf` | `scripts.d/45-vmaf.sh` | `e80d6c593e6e2327687dccd00b7cc9c91036d79f` | 1 |
| `--enable-fontconfig` | `scripts.d/45-fonts/35-fontconfig.sh` | `d32a1911248576d01583557efcfe4b48fb2d0a5e` | 1 |
| `--enable-libharfbuzz` | `scripts.d/45-fonts/45-harfbuzz.sh` | `d8dabe2594596c656b54c3b0072f3aa3093f30a9` | 1 |
| `--enable-libfreetype` | `scripts.d/45-fonts/50-freetype.sh` | `9e9d3b73f31367dbb4261f93c727a277f6632c77` | 1 |
| `--enable-libfribidi` | `scripts.d/25-fribidi.sh` | `04a8cb7a3674717e509c79cd6ee3e127d0c75f4c` | 1 |
| `--enable-vulkan` | `scripts.d/47-vulkan/45-vulkan-loader.sh` | `65b3936528cd92eb4ea3de485d03f858a3850484`, `v1.4.359` | 1 |
| `--enable-libvorbis` | `scripts.d/45-libvorbis.sh` | `1b75110b5a2754ba1931d82dd83cb822b266a21d` | 1 |
| `--enable-gmp` | `scripts.d/25-gmp.sh` | `9994908f090c694f8a152d660dc6852e0c48557a` | 1 |
| `--enable-lzma` | `scripts.d/25-xz.sh` | `c8b8ab2ef1eb0a0217ad2027d7f5d242ceb944d3` | 1 |
| `--enable-liblcevc-dec` | `scripts.d/50-lcevcdec.sh` | `a254bd474649e5dcd8182689ac414420bfe8d8c3` | 1 |
| `--enable-opencl` | `scripts.d/45-opencl.sh` | `c9c8ccfab584f9f7610057c4633dbd3df7e012cc`, `18fdcd58286376124f938948aa8ed156079c1c16` | 1 |
| `--enable-amf` | `scripts.d/50-amf.sh` | `c35f613aea2e5057a688c979e75b1cf24253297e` | 1 |
| `--enable-libaom` | `scripts.d/50-aom.sh` | `95f420511f698ea201e8928464704dc30da4b568` | 1 |
| `--enable-libaribb24` | `scripts.d/50-aribb24/50-libaribb24.sh` | `5e9be272f96e00f15a2f3c5f8ba7e124862aec38` | 1 |
| `--enable-avisynth` | `scripts.d/50-avisynth.sh` | `de1d1fc0d69e6d308235491b24b8e9b26ac023ff` | 1 |
| `--enable-chromaprint` | `scripts.d/50-chromaprint.sh` | `aed8eba2202dd9d7b3b0a56c77904cc805490d72` | 1 |
| `--enable-libdav1d` | `scripts.d/50-dav1d.sh` | `54706fc6bc0cdecab7e9593974a4039cc038fca7` | 1 |
| `--enable-libdavs2` | `scripts.d/50-davs2.sh` | `b41cf117452e2d73d827f02d3e30aa20f1c721ac` | 1 |
| `--enable-libdvdread` | `scripts.d/50-dvd/40-libdvdread.sh` | `ce9bdb7775601f4e6b95136b875bc72a53c5ba7d` | 1 |
| `--enable-libdvdnav` | `scripts.d/50-dvd/50-libdvdnav.sh` | `2ffc50b5c37a6ddc086829203fc44e95588198dd` | 1 |
| `--enable-ffnvcodec` | `scripts.d/50-ffnvcodec.sh` | `eddcea9e27f6b772057c9b3f87de2cc1737faffc`, `ced4f8eba3ba5dd431932cba17928f0dffdaeb2b`, `833faee5f7b8d3f56444347c587f4aed11ee213f` | 1 |
| `--enable-cuda-llvm` | `scripts.d/50-ffnvcodec.sh` | `eddcea9e27f6b772057c9b3f87de2cc1737faffc`, `ced4f8eba3ba5dd431932cba17928f0dffdaeb2b`, `833faee5f7b8d3f56444347c587f4aed11ee213f` | 1 |
| `--enable-frei0r` | `scripts.d/50-frei0r.sh` | `253addfd4bea3c90b0bf765589ca28ea18f3ddc0` | 1 |
| `--enable-libgme` | `scripts.d/50-gme.sh` | `fe8da4b6d3876d7542c2fb69d94487e19836d678` | 1 |
| `--enable-libkvazaar` | `scripts.d/50-kvazaar.sh` | `d6815293f34a094e26ba6c50b8644660ddc13e09` | 1 |
| `--enable-libaribcaption` | `scripts.d/50-libaribcaption.sh` | `c64c23b8905ba514b87c9789269e9f66f949ffe0` | 1 |
| `--enable-libass` | `scripts.d/50-libass.sh` | `3087d2b2ffda76602a17f9b09d25cb8addc8d313` | 1 |
| `--enable-libbluray` | `scripts.d/50-libbluray.sh` | `065247e5ef40ccf39857db81e2c1368354a23ef8` | 1 |
| `--enable-libjxl` | `scripts.d/50-libjxl/50-libjxl.sh` | `d089091afeb7b00b3d0fec6f019d35eaa3b2b410` | 1 |
| `--enable-libmp3lame` | `scripts.d/50-libmp3lame.sh` | OS interface; no download | 1 |
| `--enable-libopus` | `scripts.d/50-libopus.sh` | `3da9f7a6db1c05c3996cb363a9d1931a978bf1be` | 1 |
| `--enable-libplacebo` | `scripts.d/50-libplacebo.sh` | `22ee762e8e0890fc54068beb670310f0edce7263` | 1 |
| `--enable-librist` | `scripts.d/50-librist/50-librist.sh` | `4f45ef8f78983892d52ccd52d9f675435b23738f` | 1 |
| `--enable-libssh` | `scripts.d/50-libssh.sh` | `1dc52926c54b59ea7a3350a59a476bb76da3ff33` | 1 |
| `--enable-libtheora` | `scripts.d/50-libtheora.sh` | `28fd5ec77f0ad0e07a371cef1047828116f6bd8a` | 1 |
| `--enable-libvpx` | `scripts.d/50-libvpx.sh` | `9cc8e1c18024d6b64422ecb7fdd7a43c8e873908` | 1 |
| `--enable-libwebp` | `scripts.d/50-libwebp.sh` | `ba8358578ecbc4c75f0723163275de00dec0c704` | 1 |
| `--enable-libzmq` | `scripts.d/50-libzmq.sh` | `46493370217ac135246617fa2f6ac819d8b61bfc` | 1 |
| `--enable-lv2` | `scripts.d/50-lilv/99-lilv.sh` | `4b8f30055fa5cb4134a2eb45fc1555bc04289314` | 1 |
| `--enable-libvpl` | `scripts.d/50-onevpl.sh` | `674d015bcb294bc39fa276e99a652ea045423e82` | 1 |
| `--enable-openal` | `scripts.d/50-openal.sh` | `c157b87cb9eb58d747748e49f82ee4a64d1dcf8b` | 1 |
| `--enable-liboapv` | `scripts.d/50-openapv.sh` | `d625af974550427e638574db61c270fe7f8c5a73` | 1 |
| `--enable-libopencore-amrnb` | `scripts.d/50-opencore-amr.sh` | `7dba8c32238418ce0b316a852b2224df586ca896` | 1 |
| `--enable-libopencore-amrwb` | `scripts.d/50-opencore-amr.sh` | `7dba8c32238418ce0b316a852b2224df586ca896` | 1 |
| `--enable-libopenh264` | `scripts.d/50-openh264.sh` | `98bc7cbbeb7381c94ef8f9a5d158327abbf6b8b9` | 1 |
| `--enable-libopenjpeg` | `scripts.d/50-openjpeg.sh` | `402ef5862195b177ea0a7788f2a6ef2804e62285` | 1 |
| `--enable-libopenmpt` | `scripts.d/50-openmpt.sh` | `1b000d4bca071364157b5d35940efe4feecd2e0a` | 1 |
| `--enable-librav1e` | `scripts.d/50-rav1e.sh` | `564ae3b0007ae2b06893fd7166bf88c5a84c5b63` | 1 |
| `--enable-librubberband` | `scripts.d/50-rubberband.sh` | `e4296ac80b1170018a110bc326fd0d45a0eb27d6` | 1 |
| `--enable-schannel` | `scripts.d/50-schannel.sh` | OS interface; no download | — |
| `--enable-sdl2` | `scripts.d/50-sdl.sh` | `a2e7c76bda17c853ba93c7d2c9fdddf8a9d621d1` | 1 |
| `--enable-libsnappy` | `scripts.d/50-snappy.sh` | `747488a9f3d0daf9b639b6704d7188fba48af179` | 1 |
| `--enable-libsoxr` | `scripts.d/50-soxr.sh` | `945b592b70470e29f917f4de89b4281fbbd540c0` | 1 |
| `--enable-libsrt` | `scripts.d/50-srt.sh` | `fcae57145c000a9e7b72aa777adb8f85c2463242` | 1 |
| `--enable-libsvtav1` | `scripts.d/50-svtav1.sh` | `fb0ed7e5999caef1c4b51b7b4c8dc2c8c10f9291` | 1 |
| `--enable-libtwolame` | `scripts.d/50-twolame.sh` | `6fced852d4d5cfad58cf9dbe3ea619b08e87d398` | 1 |
| `--enable-libuavs3d` | `scripts.d/50-uavs3d.sh` | `0e20d2c291853f196c68922a264bcd8471d75b68` | 1 |
| `--enable-vaapi` | `scripts.d/50-vaapi/50-libva.sh` | `6b07f7100512817f736967e899b8c26313c20623` | 1 |
| `--enable-libvidstab` | `scripts.d/50-vidstab.sh` | `c9985e75303da2ba1a78b37083a2bec2ed5baebc` | 1 |
| `--enable-libvvenc` | `scripts.d/50-vvenc.sh` | `0f2e874451d6b194615e5dfefdc96796a7da00f4` | 1 |
| `--enable-libx264` | `scripts.d/50-x264.sh` | `0480cb05fa188d37ae87e8f4fd8f1aea3711f7ee` | 1 |
| `--enable-libx265` | `scripts.d/50-x265.sh` | `b81f650e21e8aacbe6a9ad04ce14aefc05b932c0` | 1 |
| `--enable-libxavs2` | `scripts.d/50-xavs2.sh` | `eae1e8b9d12468059bdd7dee893508e470fa83d8` | 1 |
| `--enable-libxvid` | `scripts.d/50-xvid.sh` | OS interface; no download | 1 |
| `--enable-libzimg` | `scripts.d/50-zimg.sh` | `f6cc75ad23db1bb9c53673c15523e6b6e960ffc6` | 1 |
| `--enable-libzvbi` | `scripts.d/50-zvbi.sh` | `d3a5ee9f2b047bf16cd1ee5ccf6ec05ee75409d0` | 1 |

## Distribution

Use one source companion for every app release that bundles this exact runtime; do not duplicate it in each hotfix. Preserve it during artifact cleanup. The app's own source, MIT declaration and the GPLv3-or-later FFmpeg executable are distinct; no exception to third-party terms is asserted here.

Reference guidance: [FFmpeg legal information](https://ffmpeg.org/legal.html), the GPL text supplied with the runtime, and [build map](../guides/MSIX_BUILDING_RUNTIME.md). The complete observed configure line is in `src-tauri/msix/FFMPEG_CONFIGURATION.txt`.

