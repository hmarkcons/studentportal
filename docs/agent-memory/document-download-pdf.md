---
name: document-download-pdf
description: "Student documents download — merged-PDF \"Download all / selected\", and the now-dead ZIP component"
metadata:
  node_type: memory
  type: project
  originSessionId: 824ead93-2e09-425b-a56b-c045e7353628
  modified: 2026-10-29T18:53:03.192Z
---

Document download was reworked (Oct 2026) at the user's request from a single ZIP to **two merged-PDF buttons**.

**Current design:** `src/components/DownloadDocumentsPdf.tsx` renders **"Download all"** (merge every uploaded document into one PDF) and **"Download selected…"** (dialog grouped by section with per-section + master select-all → merge the chosen subset). Both run in the browser, reusing `combineIntoPdf` (`src/lib/combinePdf.ts`, the upload merge path, pdf-lib). **Word/HEIC can't go into a PDF** so they're listed as "left out", not failed. Mounted on the staff Documents tab (via `DocumentChecklist`'s `downloadPdf` prop) and the student portal Documents page.

**Links are minted fresh at click time** (not page-stale): staff via `documentDownloadLinks` (processing-team gated, `seesStagesOnly`); students via the new `studentDocumentDownloadLinks` (reads the caller's OWN record from their session, RLS-scoped) in `src/lib/actions/studentDocumentDownload.ts`.

**Data model recap:** documents = `student_documents` (requirement; `category` keys the section; `file_path` = newest file) + `student_document_files` (per-file, 0328). "Visa" is just a category, not a separate table. Bucket `documents` (private), signed via `src/lib/storageUrls.ts`.

**Dead code left in place (pending user decision to remove):** the old ZIP UI `src/components/DownloadAllDocuments.tsx` is no longer wired, and its verify script `scripts/verify-documents-zip.mjs` (`npm run check:docszip`) is now stale. `src/lib/documentZip.ts` (safeName/extensionForType) and `src/lib/jpegPdf.ts` are still used elsewhere / by combine. Don't delete without the user's OK.

**Open UI choices the user may revisit:** button placement (currently beside "Expand all" above the sections) and whether to delete the dead ZIP component. User tests this on the live portal ([[user-tests-on-live-portal]]) — it's browser-only (canvas + pdf-lib), not unit-testable.
