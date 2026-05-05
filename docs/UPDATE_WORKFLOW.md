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
2. Create and push a new version tag:

```bash
git tag v0.1.3
git push origin v0.1.3
```

3. GitHub Actions (`Build Desktop Apps`) will:
   - build macOS + Windows artifacts
   - create/update GitHub Release for that tag
   - upload installer files

After release is published, users can click the `Update` button in-app to download and install that version.

## Notes

- Do not reuse old tags (`v0.1.1`, etc.). Always create a new tag.
- Version comparison uses `app.getVersion()` from `package.json`.
- If your release files naming changes, update asset selection logic in `app/electron/main.ts`.
