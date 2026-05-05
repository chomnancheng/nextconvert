# NextConvert Update Workflow

This project now supports in-app update checks from the header `Update` button.

## How in-app update works

1. App checks latest GitHub release from `chomnancheng/nextconvert`.
2. If a newer version exists, app downloads the correct installer:
   - Windows: `.exe`
   - macOS: `.dmg` (x64 or arm64 based on device)
3. File is saved to `~/Downloads/NextConvert-updates/`.
4. App opens installer/dmg so user can complete update.

## How to ship a new update

1. Push code changes to `main`.
2. Create and push a new version tag (example `v0.1.4`):

```bash
git tag v0.1.4
git push origin v0.1.4
```

3. GitHub Actions (`Build Desktop Apps`) will:
   - build macOS + Windows artifacts
   - create/update a GitHub Release for that tag
   - upload installer files

After the GitHub Release is created (with assets), users can click the `Update` button in-app to download and install that version.

Note: if the tag exists but the GitHub Release/assets aren’t published yet, version checking may still succeed, but downloading will fail with a message like “Latest tag has no published release assets yet”.

## Notes

- Do not reuse old tags (`v0.1.1`, etc.). Always create a new tag.
- Version comparison uses `app.getVersion()` from `package.json`.
- If your release files naming changes, update asset selection logic in `app/electron/main.ts`.
- Update downloads are saved to `~/Downloads/NextConvert-updates/` and the installer/dmg is opened for the user to complete installation.
