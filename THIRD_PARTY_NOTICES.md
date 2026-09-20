# Third-party notices

## GenOffice — `packages/docx-engine`

- Upstream: https://github.com/genspark-ai/genoffice
- Commit: `d24c964a3e693a52d9fece4fef03a4de34d0d853`
- License: Apache License 2.0 (see `src/vendor/genoffice/LICENSE` and `src/vendor/genoffice/NOTICE`)
- Vendored path: `src/vendor/genoffice/docx-engine`, plus `src/vendor/genoffice/pptx-engine/custgeom.ts`
  (single cross-package dependency required by the DOCX engine).
- Scope: only Apache-2.0 open-source engine packages are used. The `/ee` directory of the
  upstream repository is excluded, as is the Electron desktop application shell and any UI code.
- Trademarks: "GenOffice" and "Genspark" names and logos are not used as UniWork branding.
  The name appears only as an internal engine identifier in benchmark metadata.

### Runtime dependencies pulled in by the vendored engine

| Package | License |
| --- | --- |
| `jszip` | MIT / GPL-3.0-or-later (MIT used) |
| `fast-xml-parser` | MIT |
| `utif2` | MIT |

## Other

`pdf-lib`, `@pdf-lib/fontkit`, and `fflate` are used by the builtin office engine and
weekly report export; their licenses (MIT) apply as published by their maintainers.
