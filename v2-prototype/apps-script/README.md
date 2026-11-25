# PADOVA V2 — Apps Script inventory staging

**Status:** source prepared and mock-tested, **not deployed**.

This folder is for a **new, standalone Apps Script project**, linked only to the
[PADOVA V2 Inventory Sandbox](https://docs.google.com/spreadsheets/d/1nVvEU51gktNpt8T4XDaokqw33O-yVgbyEWx4D62OBuI).
Never paste it over the existing live Inventory or Attendance Apps Script.

## What's implemented

- Staging spreadsheet ID allowlist (the live workbook is not a valid target).
- `setupPadovaV2Staging()` adds the request-ID, reversal, and purchase-link sheets
  to the staging workbook while verifying existing headers.
- Minimal authenticated staff `doPost` actions: `stockIn`, `stockOut`, `itemLookup`.
- Single script lock for concurrent writes.
- Authoritative stock balance calculated from opening quantity + posted ledger
  movements, not browser-submitted `stockBefore`/`stockAfter`.
- Stable request ID deduplication and partial-write retry recovery.
- `stockOut` **with supplier reference** reverses unmatched goods receipts under
  the same item and reference. `stockOut` **without reference** records a normal
  material withdrawal. Fully reversed receipts stop being matchable to purchases.
- Public `doGet` returns only a staging health signal (no inventory or pricing).
- One-time staging device-token provisioning, with its SHA-256 hash held only in
  Apps Script properties. Never commit the token or transmit it in a URL.

## What isn't done yet

- This is not attached to the demo HTML or live Terminal.
- Owner purchasing writes and financial read access are **not exposed** via the
  public web endpoint. Owner authentication must be designed first.
- Local/offline queue integration and QR scanner integration remain to be done.
- Production transaction quotas, schema migrations, and recovery procedures need
  end-to-end tests on the staging Google Sheet and tablet.
- Staff corrections must eventually obey the agreed recent/unlinked correction
  policy (proposed 15-minute window); **do not deploy this backend for staff** yet.

## Next safe setup step

1. Create a **separate Apps Script project** named `PADOVA V2 Inventory STAGING`
   using [script.google.com](https://script.google.com/), **not** the current
   production project's editor.
2. Copy `PADOVA_V2_Inventory_Staging.gs` into that project.
3. Before any web deployment, review the `V2_STAGING_SPREADSHEET_ID` constant and
   confirm that it matches the V2 sandbox, not the original inventory workbook.
4. Run `setupPadovaV2Staging()` in the new project, authorize only the staging
   spreadsheet, and inspect its resulting tabs. This adds staging-only headers
   and sheets; it does not modify real stock.
5. Stop there and return to the V2 implementation review. We'll wire the test
   frontend and choose the authenticated deployment approach before permitting
   any tablet to submit writes.

## Local regression tests

`node v2-prototype/apps-script/backend.test.mjs`

The test harness provides in-memory spreadsheet mocks, so no Google Sheet is
written while the tests run.
