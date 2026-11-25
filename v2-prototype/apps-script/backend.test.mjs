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
   setValue:v=>{this.rows[r-1]??=[];this.rows[r-1][c-1]=v;}
 };}
}
const sheets={
 'Item Master':new Sheet([['Item Code','Name','Type','Unit','Opening','Active'],['HCSSP01','Dacron','Raw Material','ball',8,'YES']]),
 'Goods Receipts':new Sheet([['Receipt ID']]),
 'Receipt Reversals':new Sheet([['Reversal ID']]),
 'Stock Movements':new Sheet([['Movement ID']]),
 'Purchase Receipt Links':new Sheet([['Link ID']])
};
const workbook={getId:()=>STAGING_ID,getSheetByName:n=>sheets[n],insertSheet:n=>(sheets[n]=new Sheet([]))};
const context={
  SpreadsheetApp:{openById:id=>{assert.equal(id,STAGING_ID);return workbook;},flush(){}},
  LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
  Utilities:{getUuid:()=>crypto.randomUUID(),computeDigest:(_,v)=>[...crypto.createHash('sha256').update(v).digest()].map(b=>b>127?b-256:b),DigestAlgorithm:{SHA_256:'sha256'}},
  PropertiesService:{getScriptProperties:()=>({getProperty:key=>props.get(key),setProperty:(key,value)=>props.set(key,value)})},
  Session:{getActiveUser:()=>({getEmail:()=> 'padovaindonesia@gmail.com'})},
  HtmlService:{createHtmlOutputFromFile:name=>({name,setTitle(){return this}})},
  ContentService:{createTextOutput:s=>({setMimeType(){return {text:s}}}),MimeType:{JSON:'JSON'}},
  console,Logger:{log(){}},Date,JSON,Number,String,Object,Array,Error,Math
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(new URL('./PADOVA_V2_Inventory_Staging.gs',import.meta.url),'utf8'),context);
assert.equal(context.doGet({parameter:{ui:'staff'}}).name,'PADOVA_V2_Staff_Staging');
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
console.log('PASS: Apps Script staging receive/reverse, idempotency, no lingering receipt, stock consistency');
