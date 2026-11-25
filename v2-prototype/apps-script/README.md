# PADOVA V2 — Apps Script inventory staging

**Status:** isolated, owner-only Apps Script `/dev` preview exists. The staff
receipt/correction bridge was verified against the sandbox. The owner purchase
bridge in this folder is the **next staging update**, not live production.

This folder is for a **new, standalone Apps Script project**, linked only to the
[PADOVA V2 Inventory Sandbox](https://docs.google.com/spreadsheets/d/1nVvEU51gktNpt8T4XDaokqw33O-yVgbyEWx4D62OBuI).
Never paste it over the existing live Inventory or Attendance Apps Script.

## What's implemented

- Staging spreadsheet ID allowlist (the live workbook is not a valid target).
- `setupPadovaV2Staging()` verifies existing headers and extends the **sandbox
  only** with purchase matching status, revision, and save-request headers.
- Minimal authenticated staff `doPost` actions: `stockIn`, `stockOut`, `itemLookup`.
- Single script lock for concurrent writes.
- Authoritative stock balance calculated from opening quantity + posted ledger
  movements, not browser-submitted `stockBefore`/`stockAfter`.
- Stable request ID deduplication and partial-write retry recovery.
- `stockOut` **with supplier reference** reverses unmatched goods receipts under
  the same item and reference. `stockOut` **without reference** records a normal
  material withdrawal. Fully reversed receipts stop being matchable to purchases.
- `doGet(?ui=staff)` serves a staff-only screen; `doGet(?ui=owner)` serves an
  owner-only purchasing screen. All other GET requests return a health signal.
- One-time staging device-token provisioning, with its SHA-256 hash held only in
  Apps Script properties. Never commit the token or transmit it in a URL.
- Staff-only `PADOVA_V2_Staff_Staging.html` interface, backed by `v2StaffApi` using
  `google.script.run` from the **same Apps Script origin**. No prices, purchasing,
  or owner administration on the staff page.
- Small-screen quantity controls, item lookup by code, explicit success and
  failure states, one-time device-token entry, and safe same-ID retries when a
  response is interrupted. Both item and input form clear after a confirmed save.
- `v2OwnerApi` permits exactly `snapshot` and `savePurchase`, checked against
  the owner's signed-in Google account server-side. It cannot post stock moves.
- `PADOVA_V2_Owner_Staging.html` keeps the prior two-column owner design:
  supplier, invoice, item, quantity, cost, receipt matching, unmatched receipts,
  and editable purchasing history. Receipt selections synchronize the invoice
  reference and **operational stock quantity**. Correcting an invoice number
  automatically re-evaluates matching even without checking a receipt box.
- Supplier invoice quantities/units (e.g., **kg**) remain separate from
  operational stock quantities/units (e.g., **balls**). Matching always uses
  operational quantities; purchases **never** create stock movements.
- Purchase edits use stable purchase IDs, revisioned receipt-link records,
  owner-authorized updates, and request-ID deduplication/retry recovery. Previous
  allocations remain in the link ledger but only the latest revision counts.
- Legacy sandbox purchasing rows with a single Goods Receipt ID remain usable
  as inferred legacy allocations without changing historic rows.

## What isn't done yet

- This is not attached to the original browser-only demo or live Terminal.
- Owner purchasing has not yet had its real browser-to-Sheet integration test.
  The new owner UI and API must be saved to staging, schema setup rerun, and
  tested with fictional sandbox documents before it is considered verified.
- Camera QR scanner integration and persistent offline queue remain to be done.
- Production transaction quotas, schema migrations, and recovery procedures need
  end-to-end tests on the staging Google Sheet and tablet.
- Staff corrections must eventually obey the agreed recent/unlinked correction
  policy (proposed 15-minute window); **do not deploy this backend for staff** yet.

## Deploy the next staging update

1. Use only the [PADOVA V2 Inventory STAGING Apps Script project](https://script.google.com/home/projects/1Li8-E-WzPeifHtHlQNm736RYhZbg41xGtiO5j8Pysmo0gEg3kH6YH12H/edit), not the live Terminal project.
2. Update `Code.gs` from `PADOVA_V2_Inventory_Staging.gs`, and add
   `PADOVA_V2_Owner_Staging.html` as an HTML file with that base name.
3. Run `setupPadovaV2Staging()` once to extend the staging-only schema.
4. Test privately at the existing **editor-only** `/dev?ui=owner` preview.
   Do **not** change the existing owner-only `/exec` deployment or its access.
5. Verify: wrong invoice → Pending; correct invoice on Edit → Matched;
   intentionally wrong quantity → Partially Matched; manual selection syncs
   both invoice number and stock quantity. Stock must remain unchanged on
   every purchasing action.

The older `v2-prototype/index.html` remains a local demo, not the connected
owner interface. The new owner HTML is the intended integrated staging screen.

## Local regression tests

`node v2-prototype/apps-script/backend.test.mjs`

`node v2-prototype/apps-script/staff-ui.unit.test.mjs`

`node v2-prototype/apps-script/owner-ui.unit.test.mjs`

The test harness provides in-memory spreadsheet mocks, so no Google Sheet is
written while the tests run.
