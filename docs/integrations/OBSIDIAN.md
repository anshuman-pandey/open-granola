# Open Granola notes in Obsidian

Open Granola can export a meeting as a Markdown file with Obsidian properties. No Obsidian plugin or account connection is required. Exporting creates a file; it does not connect to or modify a vault automatically.

## Export a meeting

1. Open a saved meeting and review its generated decisions and tasks.
2. Choose **Export → Obsidian note**.
3. Move the downloaded `.md` file into your chosen Obsidian vault folder, then open it in Obsidian.
4. Check the properties, summary, task checkboxes and timestamped transcript. The note body follows your interface language; property keys remain stable across languages.

Use **Export → Markdown file** for the existing plain Markdown format. The browser preview also exports its labeled sample meetings; this does not test recording.

## Properties and filenames

| Property | Meaning |
|---|---|
| `title` | Original meeting title |
| `date` | Meeting start time in ISO 8601, normalized to UTC |
| `source` | `Open Granola` |
| `open_granola_id` | Original saved meeting identifier |
| `duration_minutes` | Recorded meeting duration in minutes |
| `participants` | Recorded participant names; these do not establish speaker identification |
| `tags` | `open-granola` plus unique meeting tags that fit Obsidian's tag syntax |
| `open_granola_tags` | All original meeting tags, including those unsuitable for Obsidian tags |

The filename contains a UTC date, a portable title and a stable hash of the meeting ID. Separate same-title meetings get different filenames in normal use. Re-exporting a meeting with the same title produces the same proposed filename; your browser or file manager decides whether to overwrite or append a duplicate suffix. A changed title changes the proposed filename. There is no automatic merge or two-way synchronization.

Original task completion states remain Markdown checkboxes. Editing them in Obsidian does not update Open Granola. Saved summary processing history, when present, is included in the note body. No credentials, raw audio or app database are part of this export.

## Privacy and validation

The exporter formats the selected meeting in the app and initiates a local file download. Obsidian Sync, third-party plugins, cloud-backed vault folders and backups may subsequently handle that file according to their own configuration. Deleting the meeting in Open Granola does not delete exported copies.

Automated tests parse the properties as YAML and check Unicode, delimiter-like input, stable filenames, localized headings, task states and the export menu. Opening the export in a real Obsidian installation is a separate compatibility check; report its version and outcome through the [first-run form](https://github.com/anshuman-pandey/open-granola/issues/new?template=first-run.yml).

Obsidian's primary references: [properties](https://help.obsidian.md/properties) and [tags](https://help.obsidian.md/tags). This integration is maintained here and is not an Obsidian endorsement.
