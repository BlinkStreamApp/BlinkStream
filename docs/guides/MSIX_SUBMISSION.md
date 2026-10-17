# Microsoft Store submission — Blink Stream 1.5.2

Updated: 2026-10-17
Status: local package rebuilt and checked; user handles Partner Center; not uploaded or submitted

The maintainer confirms that 1.5.1 is already published in Store. This document now
binds the 1.5.2 chat-search update, not the previously accepted package. The agent does not
access Partner Center or submit this update. Package identity is unchanged.

## Authorized route

Submit the MSIX candidate for Microsoft's certification, with publication held
until a separate manual decision. Do not require a new VM or install certificates
or BlinkStream on the user's daily-use PCs. Do not publish a GitHub app release,
change stable download links, or delete Actions artifacts as part of this route.

In Partner Center, open **Blink Stream** (Store ID `9NQZ79VL630L`), not the former
Win32 listing or the test product. Under **Submission options → Publishing hold
options**, select **Don't publish this submission until I select Publish now**.
Save and verify this setting before selecting **Submit to the Store**. The default
is automatic publication after certification; do not leave the default selected.

Microsoft's [submission options](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/manage-submission-options)
and [certification process](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/app-certification-process)
describe these separate steps. A local WACK report is not an upload attachment;
Microsoft directs developers to run WACK before submission and performs its own
technical compliance tests. Our local WACK run produced no report and is not a pass.

## Candidate binding

- File: `src-tauri/target/msix/BlinkStream_1.5.2.0_x64.msix`
- Size: 94,725,975 bytes
- SHA256: `7832CDA78728528BA1FF7EE13AB503E5A60F79E8657BA7AA286BE95267A47DA5`
- Identity Name: `APXStudio.7806DADA0693`
- Publisher: `CN=3B464BD9-E8B7-489D-8127-EA042A644ED5`
- Publisher display name: `APX Studio`
- Architecture/version: x64 / `1.5.2.0`

Recheck `candidate.json` and the actual file before upload. If package contents or
notices change, rebuild, record the new hash here and validate that candidate.
These identifiers bind only the current local candidate, not a future rebuild.
If Partner Center has already accepted this identity/version, use a higher package
version for different content; never silently substitute bytes in an existing submission.

## Source companion and validation

`src-tauri/target/msix/BlinkStream-1.5.0-runtime-sources.zip`:
2,116,378,839 bytes; SHA256
`f3bd70b2068668b6cfaa035ad405e1fb4d9b78a3327e90b586884d141befe0db`.
Contains the pinned source inventory, upstream scripts/patches/cache, a build map
and the observed complete FFmpeg configuration. All six source inputs were rechecked
inside the companion against the pinned inventory. The companion is now public at
[the persistent 1.5.0 source asset](https://github.com/BlinkStreamApp/BlinkStream/releases/download/v1.5.0/BlinkStream-1.5.0-runtime-sources.zip);
a full public download streamed to SHA256 matches the local file (no duplicate saved).
The technical correspondence review maps all 72 enabled FFmpeg options to supplied
scripts/snapshots or intrinsic/OS settings; no source-download script lacks its keyed
cache archive. See [review](../reviews/MSIX_SOURCE_CORRESPONDENCE.md). No exact rebuild,
patent clearance or legal certification is claimed.

The rebuilt MSIX passed MakeAppx pack/unpack, executable/manifest/runtime hash
verification, 33 release tests, 742 frontend tests (one skipped), and full frontend
lint. All 63 generated PNG variants and resources.pri matched after unpacking;
MakePRI dump confirmed target sizes and UNPLATED/LIGHTUNPLATED candidates. Third-party notices are available in About and in the package root. This
new hash was not installed in Sandbox; earlier smoke results apply to the previous
candidate/runtime, not a new end-to-end acceptance. No host installation or app
publication was performed during the local package check; source publication is
recorded above. WACK and certification of this new MSIX remain uncompleted.

Runtime executables are unchanged from 1.5.0; the same source companion above is
retained rather than generating another duplicate 2 GB archive for a frontend update.
Certifier update note: version 1.5.2 adds in-memory native session chat search by text,
sender, links and source channel, with eight-language labels and preserved moderation
deletions. Store runtime notices include the actual source URL/hash and a translated
download link, visually checked in eight languages at 320/700 px. The existing
transparent taskbar/Start icon variants and resource index remain.
No application capability or package identity is added or changed.

Security rebuild: updater defaults now exclude the unused ZIP feature and vulnerable
`zip 4.6.1`; raw EXE/AppImage and macOS TAR.GZ support/TLS/signature checks remain.
The failed v1.5.2 tag was not published as an app release. After explicit maintainer
authorization, corrected source `3a5908e` passed candidate CI `39059837052`; only
that tag was recreated. Publication CI `39060821359` passed and all 15 public GitHub
files/four updater signatures were independently verified. This is not Store
certification or fresh installed/WACK acceptance of the separate MSIX above.

The Python copyleft supplement is also public and byte-verified:
[pycountry/iso-codes/certifi sources](https://github.com/BlinkStreamApp/BlinkStream/releases/download/v1.5.0/BlinkStream-1.5.0-python-copyleft-sources.zip),
12,561,727 bytes, SHA256 `2601249875bdfb29b66f36fa06f4772c52f29f5f1d19ca1a453a4cdd3d6c2856`.
Its build map and pinned generator are documented in [MSIX_PYTHON_SOURCES.md](MSIX_PYTHON_SOURCES.md).

## Distributor checklist

- [x] Technical source inventory/configuration/script/cache correspondence reviewed;
  build map and original licenses preserved. This is not a legal opinion or exact rebuild.
- [x] Source companion publicly accessible to recipients with verified bytes and
  actual download instructions in the package/About notices. Preserve this source asset.
- [ ] Arrange a dedicated Twitch tester account through Partner Center's private
  certification notes, if needed by Microsoft. Never commit credentials, personal
  sessions, OAuth tokens or recovery codes. Do not use the owner's personal account.
- [ ] Record packaged Twitch login/playback/chat/short recording results, or disclose
  them as unverified; do not reuse un-packaged app acceptance as packaged proof.
- [ ] Verify listing, privacy URL, screenshots, supported desktop devices and the
  restricted-capability explanation below against the actual submission.
- [ ] Verify the manual publishing hold is saved before submission.

## Draft certification notes (English)

Review these notes against the final package; supply any test-account details only
in the private Partner Center fields, not this repository.

> Blink Stream is a desktop Twitch client by APX Studio. Select Twitch in the top
> right to sign in through the normal Twitch OAuth flow. Signing out clears the
> account-specific UI. Twitch is an external service and requires Internet access.
>
> After signing in, select a live channel to test playback and chat. Collections
> are available from Home. For recording, use the player's recording control,
> stop a short recording and verify the output in the selected output directory.
> Companion is optional and must be enabled explicitly for a trusted local network.
>
> This Microsoft Store build does not use the GitHub self-updater or automatically
> install tools through winget. Streamlink, Python and FFmpeg are packaged runtime
> tools. Microsoft Edge WebView2 Evergreen is an external prerequisite. When it is
> unavailable, the app displays a native notice with Microsoft's download URL;
> it does not silently install it. The App Installer dependency declaration does
> not guarantee provisioning through Microsoft Store.
>
> Local WACK could not produce a report in Windows Sandbox because appcert failed
> while querying WMI (UnauthorizedAccessException). We do not claim a local WACK
> pass. Packaged installation, signature verification inside the test guest,
> bundled Streamlink startup and a synthetic FFmpeg encode were verified. Normal
> Evergreen registration and full packaged Twitch flows remain unverified locally.

### Restricted capability: runFullTrust

> Blink Stream uses Tauri's desktop Rust backend to run the packaged Streamlink
> and FFmpeg child processes for Twitch stream resolution and user-requested
> recordings/clips, and to access native desktop features such as protected
> credential storage, notifications and user-selected output files. It is a
> medium-integrity desktop app, not an elevated administrator service. The Store
> build disables its separate GitHub updater and does not auto-install dependencies.

## After submission

Record the submission ID, uploaded file hash, saved publishing hold, submission
time and Microsoft's certification report. Do not mark this guide submitted based
only on uploading a file. On failure, retain the report and fix the identified
issue. On success, keep the hold until remaining distribution and functional
checks are closed and the user authorizes **Publish now**.
