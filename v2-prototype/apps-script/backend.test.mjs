import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const STAGING_ID='1nVvEU51gktNpt8T4XDaokqw33O-yVgbyEWx4D62OBuI';
const props=new Map();
class Sheet {
 constructor(rows){this.rows=rows;}
 getLastRow(){return this.rows.length;}
 appendRow(row){this.rows.push([...row]);}
 getRange(r,c,rows=1,cols=1){return {
   getValues:()=>Array.from({length:rows},(_,i)=>Array.from({length:cols},(_,j)=>this.rows[r-1+i]?.[c-1+j]??'')),
   getDisplayValues:()=>Array.from({length:rows},(_,i)=>Array.from({length:cols},(_,j)=>String(this.rows[r-1+i]?.[c-1+j]??''))),
   setValue:v=>{this.rows[r-1]??=[];this.rows[r-1][c-1]=v;},
   setValues:values=>{for(let i=0;i<values.length;i++){this.rows[r-1+i]??=[];for(let j=0;j<values[i].length;j++)this.rows[r-1+i][c-1+j]=values[i][j];}}
 };}
}
const sheets={
 'Item Master':new Sheet([['Item Code','Name','Type','Unit','Opening','Active'],['HCSSP01','Dacron','Raw Material','ball',8,'YES'],['TEST-PILLOW','Bantal Classic — DEMO','Finished Goods','pcs',4,'YES']]),
 'Goods Receipts':new Sheet([['Receipt ID']]),
 'Receipt Reversals':new Sheet([['Reversal ID']]),
 'Stock Movements':new Sheet([['Movement ID']]),
 'Purchase Receipt Links':new Sheet([['Link ID']])
};
const workbook={getId:()=>STAGING_ID,getSheetByName:n=>sheets[n],insertSheet:n=>(sheets[n]=new Sheet([]))};
const context={
  SpreadsheetApp:{openById:id=>{assert.equal(id,STAGING_ID);return workbook;},flush(){}},
  LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
  Utilities:{getUuid:()=>crypto.randomUUID(),computeDigest:(_,v)=>[...crypto.createHash('sha256').update(v).digest()].map(b=>b>127?b-256:b),DigestAlgorithm:{SHA_256:'sha256'},formatDate:()=> '2026-11-25'},
  PropertiesService:{getScriptProperties:()=>({getProperty:key=>props.get(key),setProperty:(key,value)=>props.set(key,value)})},
  Session:{getActiveUser:()=>({getEmail:()=> 'padovaindonesia@gmail.com'})},
  HtmlService:{createHtmlOutputFromFile:name=>({name,setTitle(){return this}})},
  ContentService:{createTextOutput:s=>({setMimeType(){return {text:s}}}),MimeType:{JSON:'JSON'}},
  console,Logger:{log(){}},Date,JSON,Number,String,Object,Array,Error,Math
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(new URL('./PADOVA_V2_Inventory_Staging.gs',import.meta.url),'utf8'),context);
assert.equal(context.doGet({parameter:{ui:'staff'}}).name,'PADOVA_V2_Staff_Staging');
assert.equal(context.doGet({parameter:{ui:'owner'}}).name,'PADOVA_V2_Owner_Staging');
assert.equal(context.setupPadovaV2Staging(),'Staging tables ready');
const token='test-secret-device-token';
props.set('PADOVA_V2_STAGING_DEVICE_SHA256',crypto.createHash('sha256').update(token).digest('hex'));
assert.equal(context.v2StaffApi({action:'itemLookup',itemCode:'HCSSP01',deviceToken:'incorrect'}).ok,false);
assert.equal(context.v2StaffApi({action:'itemLookup',itemCode:'HCSSP01',deviceToken:token}).stockAfter,8);
assert.equal(context.v2StaffApi({action:'stockIn',itemCode:'HCSSP01',qty:1,staffId:'STAFF',requestId:'=formula',deviceToken:token}).ok,false);
const received=context.v2Receive_({itemCode:'HCSSP01',qty:20,staffId:'TEST STAFF',supplierDoc:'1111',requestId:'req-in'});
assert.equal(received.stockAfter,28);
assert.equal(context.v2Receive_({itemCode:'HCSSP01',qty:20,staffId:'TEST STAFF',supplierDoc:'1111',requestId:'req-in'}).duplicate,true);
assert.equal(sheets['Goods Receipts'].rows.length,2);
assert.equal(sheets['Stock Movements'].rows.length,2);
const corrected=context.v2StockOut_({itemCode:'HCSSP01',qty:20,staffId:'TEST STAFF',supplierDoc:'1111',requestId:'req-out'});
assert.equal(corrected.stockAfter,8);
assert.equal(sheets['Receipt Reversals'].rows.length,2);
assert.equal(sheets['Stock Movements'].rows.length,3);
// Simulate interruption after stock movement was saved but before reversal log.
const recoveredRow=sheets['Receipt Reversals'].rows.pop();
assert.ok(recoveredRow);
const recovered=context.v2StockOut_({itemCode:'HCSSP01',qty:20,staffId:'TEST STAFF',supplierDoc:'1111',requestId:'req-out'});
assert.equal(recovered.duplicate,true);
assert.equal(sheets['Receipt Reversals'].rows.length,2);
assert.equal(sheets['Stock Movements'].rows.length,3);
assert.equal(context.v2StockOut_({itemCode:'HCSSP01',qty:20,staffId:'TEST STAFF',supplierDoc:'1111',requestId:'req-out'}).duplicate,true);
assert.equal(sheets['Receipt Reversals'].rows.length,2);
assert.equal(sheets['Stock Movements'].rows.length,3);
assert.throws(()=>context.v2StockOut_({itemCode:'HCSSP01',qty:1,staffId:'TEST STAFF',supplierDoc:'1111',requestId:'req-out-2'}),/No sufficient unmatched/);
assert.throws(()=>context.v2Receive_({itemCode:'HCSSP01',qty:30,staffId:'TEST STAFF',supplierDoc:'1111',requestId:'req-in'}),/already used/);
assert.throws(()=>context.v2Receive_({itemCode:'HCSSP01',qty:20,staffId:'TEST STAFF',supplierDoc:'DIFFERENT',requestId:'req-in'}),/different supplier reference/);
const staffResult=context.v2StaffApi({deviceToken:token,action:'stockIn',itemCode:'HCSSP01',qty:2,staffId:'STAFF',supplierDoc:'=FORMULA',requestId:'api-in'});
assert.equal(staffResult.ok,true);
assert.equal(staffResult.stockAfter,10);
assert.equal(sheets['Goods Receipts'].rows.at(-1)[6],"'=FORMULA");
assert.equal(context.v2StaffApi({deviceToken:token,action:'stockIn',itemCode:'HCSSP01',qty:2,staffId:'STAFF',supplierDoc:'=FORMULA',requestId:'api-in'}).duplicate,true);
assert.equal(context.v2StaffApi({deviceToken:token,action:'stockOut',itemCode:'HCSSP01',qty:2,staffId:'STAFF',supplierDoc:'=FORMULA',requestId:'api-out'}).stockAfter,8);
assert.equal(context.v2StaffApi({deviceToken:token,action:'stockOut',itemCode:'HCSSP01',qty:2,staffId:'STAFF',requestId:'material-out'}).stockAfter,6);
assert.match(context.v2StaffApi({deviceToken:token,action:'stockOut',itemCode:'HCSSP01',qty:1,staffId:'STAFF',requestId:'material-out'}).message,/different stock transaction/);
// MASUK without supplier reference is a capped correction of material taken
// today, never a receipt that would be available for purchase matching.
const receiptsBeforeMaterialFix=sheets['Goods Receipts'].rows.length;
const materialFix=context.v2StaffApi({deviceToken:token,action:'stockIn',itemCode:'HCSSP01',qty:1,staffId:'STAFF',requestId:'material-usage-fix'});
assert.equal(materialFix.ok,true);
assert.equal(materialFix.stockAfter,7);
assert.equal(materialFix.movementType,'MATERIAL_ISSUE_CORRECTION_IN');
assert.equal(sheets['Goods Receipts'].rows.length,receiptsBeforeMaterialFix);
assert.equal(context.v2StaffApi({deviceToken:token,action:'itemLookup',itemCode:'HCSSP01',deviceToken:token}).todayQty,1);
assert.equal(context.v2StaffApi({deviceToken:token,action:'stockIn',itemCode:'HCSSP01',qty:1,staffId:'STAFF',requestId:'material-usage-fix'}).duplicate,true);
assert.match(context.v2StaffApi({deviceToken:token,action:'stockIn',itemCode:'HCSSP01',qty:2,staffId:'STAFF',requestId:'over-material-fix'}).message,/correction exceeds usage recorded today/);

// Owner purchase matching: one source of stock, multiple administrative edits.
const physical=context.v2StaffApi({action:'stockIn',itemCode:'HCSSP01',qty:20,staffId:'STAFF',supplierDoc:'SUP-888',requestId:'test-purchase-in',deviceToken:token});
assert.equal(physical.ok,true);
const stockBeforePurchase=physical.stockAfter;
const receiptId=physical.receiptId;
const snapshot=context.v2OwnerApi({action:'snapshot'});
assert.equal(snapshot.ok,true);
assert.equal(snapshot.receipts.find(r=>r.id===receiptId).availableQty,20);
const purchaseInput={action:'savePurchase',requestId:'owner-new-1',supplier:'SUP',invoice:'WRONG',itemCode:'HCSSP01',stockQty:20,
  supplierQty:300,supplierUnit:'kg',unitCost:22000,invoiceDate:'2026-11-25',manualOverride:false,receiptIds:[]};
const pending=context.v2OwnerApi(purchaseInput);
assert.equal(pending.ok,true);
assert.equal(pending.purchases.find(p=>p.id===pending.purchaseId).status,'PENDING MATCHING');
assert.equal(pending.purchases.find(p=>p.id===pending.purchaseId).invoiceAmount,6600000);
assert.equal(context.v2OwnerApi({action:'snapshot'}).items[0].stock,stockBeforePurchase);
const correctedInvoice=context.v2OwnerApi({...purchaseInput,requestId:'owner-edit-1',purchaseId:pending.purchaseId,invoice:'SUP-888'});
assert.equal(correctedInvoice.ok,true);
assert.equal(correctedInvoice.purchases.find(p=>p.id===pending.purchaseId).status,'MATCHED');
assert.equal(correctedInvoice.purchases.find(p=>p.id===pending.purchaseId).matchedQty,20);
assert.equal(correctedInvoice.receipts.find(r=>r.id===receiptId).availableQty,0);
assert.equal(sheets['Purchase Receipt Links'].rows.length,2);
assert.equal(context.v2OwnerApi({action:'snapshot'}).items[0].stock,stockBeforePurchase);
const part=context.v2OwnerApi({...purchaseInput,requestId:'owner-edit-2',purchaseId:pending.purchaseId,invoice:'SUP-888',stockQty:15});
assert.equal(part.ok,true);
assert.equal(part.purchases.find(p=>p.id===pending.purchaseId).status,'PARTIALLY MATCHED');
assert.equal(part.receipts.find(r=>r.id===receiptId).availableQty,5);
assert.equal(context.v2OwnerApi({action:'snapshot'}).items[0].stock,stockBeforePurchase);
const manual=context.v2OwnerApi({...purchaseInput,requestId:'owner-edit-3',purchaseId:pending.purchaseId,invoice:'MANUALLY-CORRECTED',stockQty:20,manualOverride:true,receiptIds:[receiptId]});
assert.equal(manual.ok,true);
assert.equal(manual.purchases.find(p=>p.id===pending.purchaseId).status,'MATCHED');
assert.equal(manual.purchases.find(p=>p.id===pending.purchaseId).mode,'MANUAL');
assert.equal(manual.receipts.find(r=>r.id===receiptId).allocatedQty,20);
assert.equal(context.v2OwnerApi({...purchaseInput,requestId:'owner-edit-3',purchaseId:pending.purchaseId,invoice:'MANUALLY-CORRECTED',stockQty:20,manualOverride:true,receiptIds:[receiptId]}).duplicate,true);
assert.equal(sheets['Purchase Receipt Links'].rows.length,4); // one link for each revisioned match
assert.equal(context.v2OwnerApi({...purchaseInput,requestId:'owner-edit-3',purchaseId:pending.purchaseId,invoice:'DIFFERENT',stockQty:20,manualOverride:true,receiptIds:[receiptId]}).ok,false);
assert.equal(context.v2OwnerApi({...purchaseInput,requestId:'owner-new-2',invoice:'MANUALLY-CORRECTED',supplier:'SUP'}).ok,false);
assert.throws(()=>context.v2StockOut_({itemCode:'HCSSP01',qty:1,staffId:'STAFF',supplierDoc:'SUP-888',requestId:'bad-reverse'}),/No sufficient unmatched/);
const purchaseRow=sheets['Purchasing'].rows[1];
assert.equal(purchaseRow[5],300);assert.equal(purchaseRow[6],'kg');assert.equal(purchaseRow[7],20);assert.equal(purchaseRow[8],'ball');
assert.equal(sheets['Stock Movements'].rows.length,8); // purchasing made no movements
// Pre-V2 seed purchasing rows with Goods Receipt ID but no link ledger must
// remain allocated, and a staff correction cannot reverse matched goods.
const legacyReceipt=context.v2Receive_({itemCode:'HCSSP01',qty:3,staffId:'STAFF',supplierDoc:'LEGACY-INV',requestId:'legacy-receipt'});
sheets['Purchasing'].rows.push(['PUR-LEGACY','OLD SUPPLIER','LEGACY-INV','2026-11-25','HCSSP01',45,'kg',3,'ball',1000,45000,legacyReceipt.receiptId,'UNPAID','Legacy seeded row']);
const legacyState=context.v2OwnerApi({action:'snapshot'});
assert.equal(legacyState.purchases.find(p=>p.id==='PUR-LEGACY').status,'MATCHED');
assert.equal(legacyState.receipts.find(r=>r.id===legacyReceipt.receiptId).availableQty,0);
assert.throws(()=>context.v2StockOut_({itemCode:'HCSSP01',qty:1,staffId:'STAFF',supplierDoc:'LEGACY-INV',requestId:'legacy-bad-out'}),/No sufficient unmatched/);
const ownerEmail=context.Session.getActiveUser;
context.Session.getActiveUser=()=>({getEmail:()=> 'intruder@example.com'});
assert.equal(context.v2OwnerApi({action:'snapshot'}).ok,false);
assert.throws(()=>context.doGet({parameter:{ui:'owner'}}),/Only the Padova owner/);
context.Session.getActiveUser=ownerEmail;
// End-of-day production uses the same stock screen, but an independent event
// type. No supplier receipt/purchasing/BOM row is written for completed goods.
const finishedLookup=context.v2StaffApi({action:'itemLookup',itemCode:'TEST-PILLOW',deviceToken:token});
assert.equal(finishedLookup.itemType,'FINISHED_GOODS');
assert.equal(finishedLookup.stockAfter,4);
assert.equal(finishedLookup.todayQty,0);
assert.equal('unitCost' in finishedLookup,false,'Staff must not receive prices');
const receiptsBefore=sheets['Goods Receipts'].rows.length;
const finished=context.v2StaffApi({action:'stockIn',itemCode:'TEST-PILLOW',qty:6,staffId:'STAFF',requestId:'daily-finished-1',deviceToken:token});
assert.equal(finished.ok,true);
assert.equal(finished.stockAfter,10);
assert.equal(sheets['Stock Movements'].rows.at(-1)[4],'PRODUCTION_FINISHED');
assert.equal(sheets['Goods Receipts'].rows.length,receiptsBefore);
assert.equal(context.v2StaffApi({action:'stockIn',itemCode:'TEST-PILLOW',qty:6,staffId:'STAFF',requestId:'daily-finished-1',deviceToken:token}).duplicate,true);
assert.equal(context.v2StaffApi({action:'itemLookup',itemCode:'TEST-PILLOW',deviceToken:token}).todayQty,6);
assert.match(context.v2StaffApi({action:'stockIn',itemCode:'TEST-PILLOW',qty:1.5,staffId:'STAFF',requestId:'fraction',deviceToken:token}).message,/whole units/);
assert.match(context.v2StaffApi({action:'stockIn',itemCode:'TEST-PILLOW',qty:2,staffId:'STAFF',supplierDoc:'SUP-123',requestId:'bad-finished-doc',deviceToken:token}).message,/does not use a supplier/);
assert.match(context.v2StaffApi({action:'stockIn',itemCode:'HCSSP01',qty:2,staffId:'STAFF',requestId:'no-raw-doc',deviceToken:token}).message,/Supplier invoice or sales order/);
const correctedFinish=context.v2StaffApi({action:'stockOut',itemCode:'TEST-PILLOW',qty:2,staffId:'STAFF',requestId:'daily-finished-fix',deviceToken:token});
assert.equal(correctedFinish.ok,true);
assert.equal(correctedFinish.stockAfter,8);
assert.equal(sheets['Stock Movements'].rows.at(-1)[4],'PRODUCTION_CORRECTION_OUT');
assert.equal(context.v2StaffApi({action:'itemLookup',itemCode:'TEST-PILLOW',deviceToken:token}).todayQty,4);
assert.equal(context.v2StaffApi({action:'stockOut',itemCode:'TEST-PILLOW',qty:2,staffId:'STAFF',requestId:'daily-finished-fix',deviceToken:token}).duplicate,true);
assert.match(context.v2StaffApi({action:'stockOut',itemCode:'TEST-PILLOW',qty:5,staffId:'STAFF',requestId:'over-fix',deviceToken:token}).message,/exceeds finished goods recorded today/);
assert.equal(sheets['Goods Receipts'].rows.length,receiptsBefore);
console.log('PASS: staff receipts/reversals, owner matching, daily materials + correction, finished production + correction, idempotency, and no double stock');
