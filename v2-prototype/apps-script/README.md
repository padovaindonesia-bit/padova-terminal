# PADOVA V2 — Apps Script inventory staging

**Status:** staging source prepared and mock-tested, **not publicly deployed**.

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
- Staff-only `PADOVA_V2_Staff_Staging.html` interface, backed by `v2StaffApi` using
  `google.script.run` from the **same Apps Script origin**. No prices, purchasing,
  or owner administration on the staff page.
- Small-screen quantity controls, item lookup by code, explicit success and
  failure states, one-time device-token entry, and safe same-ID retries when a
  response is interrupted. Both item and input form clear after a confirmed save.
- Owner-only setup and token provisioning wrappers check the signed-in Google
  account; they are not freely callable through the HTML page.

## What isn't done yet

- This is not attached to the original browser-only demo or live Terminal.
- Owner purchasing writes and financial read access are **not exposed** via the
  public web endpoint. Owner authentication must be designed first.
- Camera QR scanner integration and persistent offline queue remain to be done.
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
5. Add the new HTML file named `PADOVA_V2_Staff_Staging` (without `.html` in the
   Apps Script file picker). Replace the existing `Code.gs` with the updated
   staging backend source from the same commit.
6. To privately preview: use **Deploy → Test deployments → Web app** and open
   the `/dev?ui=staff` URL. Google's `/dev` test deployments are limited to
   project editors; do not create an `Anyone` public `/exec` deployment yet.
7. A test device token must be provisioned **privately** using the owner-only
   editor function before stock posting can work. Never paste the token into
   GitHub, chat, or source code. Stop before issuing tokens to staff.

The short-term integration test is deliberately staff-only. Owner purchasing
remains in the separate browser-only prototype until the authenticated owner
API and reconciliation ledger are implemented and reviewed.

## Local regression tests

`node v2-prototype/apps-script/backend.test.mjs`

`node v2-prototype/apps-script/staff-ui.unit.test.mjs`

The test harness provides in-memory spreadsheet mocks, so no Google Sheet is
written while the tests run.
