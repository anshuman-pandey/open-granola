# Frontend dependency security

Reviewed on **2026-10-12**. Audit results are a snapshot of the npm advisory database, not a complete security assessment.

## Current build toolchain

The frontend now uses Tailwind **4.3.3** through its Vite plugin. Tailwind 3's vulnerable glob dependency chain (`braces`, `micromatch`, `fast-glob` and Chokidar) is absent from the installed tree. The full `npm audit --audit-level=high` reports **zero vulnerabilities** on this review date. The CI threshold is unchanged; no advisory is suppressed.

The migration removes the old PostCSS integration and `tailwindcss-animate`, uses `tw-animate-css`, and retains the existing theme through `tailwind.config.cjs`. Shadow, outline and bare-radius utilities were adjusted to retain their previous values, and the status colors remain explicitly pinned. The obsolete selector-parser override is removed because its dependency path is gone.

Validation: clean dependency installations, frontend lint/tests/security checks and a production build pass. Generated CSS was compared for workspace spacing, card shadows, button styling, typography and theme radii. This is not a completed browser or native visual review. Tailwind 4 requires [modern browsers](https://tailwindcss.com/docs/upgrade-guide): Safari 16.4+, Chrome 111+ and Firefox 128+. The macOS minimum remains 14.4; older Linux WebKit runtimes need review before promising compatible installers.

The records below describe the preceding Tailwind 3 patch and its unresolved finding at that time.

## Previous Tailwind 3 fixes

| Dependency | Change | Advisory |
| --- | --- | --- |
| `source-map-js` | Lockfile patch from 1.2.1 to 1.2.2 | [GHSA-68fv-2mgg-jv7q: indexed source-map denial of service](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) |
| `postcss-selector-parser` | Exact npm override from 6.1.4 to 7.1.6 | [GHSA-rj75-hqrm-r3gf: quadratic selector parsing](https://github.com/advisories/GHSA-rj75-hqrm-r3gf) |

Tailwind 3 and `postcss-nested` request parser 6.x. The override selects the official fixed release; it does not upgrade Tailwind. Parser 7 changes insertion behavior during iteration, so compatibility was checked before applying it. See the [upstream changelog](https://github.com/postcss/postcss-selector-parser/blob/main/CHANGELOG.md).

### Compatibility evidence

Two isolated dependency installations used Tailwind 3.4.19 with parser 6.1.4 and 7.1.6 respectively. On Node 25.6.1:

- The same 100 source files, project stylesheet and Tailwind configuration produced byte-identical CSS: 126,918 bytes. The comparison also included group, peer, dark, responsive, arbitrary selector, ARIA, data attribute and pseudo-element variants.
- Nested selector and media-query output was identical.
- The fixed parser round-tripped a flat selector with 100,000 class nodes in 154 ms in one local run. This is a regression probe, not a general performance guarantee.

These checks cover the tested source snapshot. Future Tailwind/plugin changes still need build and visual review. Revisit the override when upstream supports a fixed parser version directly.

## Previous audit finding (resolved by migration)

The full audit reports **five high-severity package entries**, all stemming from [GHSA-vfj7-8cjw-p6xm: braces stack exhaustion](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). They are `braces`, `chokidar`, `micromatch`, `fast-glob` and `tailwindcss`. The production-only audit (`npm audit --omit=dev`) reports zero findings.

The latest published `braces` is 3.0.3, with no official patched release. Tailwind's `v3-lts` release is already 3.4.19; its current glob dependencies retain `braces`. The [upstream issue](https://github.com/micromatch/braces/issues/70) remains unresolved. Replacing Chokidar alone would not remove the other dependency paths, and [Chokidar 4 removed glob support](https://github.com/paulmillr/chokidar#changelog).

These packages run in development and CSS builds. The current Tailwind content patterns are fixed repository configuration; no meeting-input path to these parsers was identified. This does not make untrusted builds safe: attacker-controlled source, CSS, configuration or glob patterns require separate review. Do not process arbitrary external CSS or source through the build toolchain as a trusted service.

At the 2026-10-10 review, **CI's `npm audit --audit-level=high` failed**. The Tailwind 4 migration described above removes that dependency chain without suppressing its advisory or changing the audit threshold.
