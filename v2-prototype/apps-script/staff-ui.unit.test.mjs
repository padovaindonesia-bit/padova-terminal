import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const html=fs.readFileSync(new URL('./PADOVA_V2_Staff_Staging.html',import.meta.url),'utf8');
assert.doesNotMatch(html,/Unit Cost|Harga Beli|Harga Jual|Owner Purchasing|<input[^>]*id="unitCost"/i,'Staff HTML must contain no prices');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script,'Staff page must contain its client controller');
new vm.Script(script,{filename:'PADOVA_V2_Staff_Staging.html'});

class El {
  constructor(id){this.id=id;this.value='';this.textContent='';this.className='';this.style={};this.dataset={};this.disabled=false;this.hidden=false;this.listeners={};}
  addEventListener(type,fn){this.listeners[type]=fn;}
  focus(){}
  select(){}
  click(){this.onclick?.();}
}
const ids=['deviceToken','applyToken','deviceState','staffId','itemCode','lookup','itemCard','itemName','itemCodeLabel','itemStock','itemUnit','todayNote','qty','supplierDoc','supplierDocGroup','actionHint','stockIn','stockOut','status','pending','pendingDetail','retry','discard','clearQty'];
const elements=Object.fromEntries(ids.map(id=>[id,new El(id)]));
const steppers=[-1,1,5].map(step=>{const e=new El('step'+step);e.dataset.step=String(step);return e});
const pendingStore=new Map();const calls=[];const seen=new Set();let stock=23,finishedStock=4,failFirstWrite=true;
const scriptRun={
  withSuccessHandler(success){return {...this,success}},
  withFailureHandler(failure){return {...this,failure}},
  v2StaffApi(payload){
    calls.push(payload);
    queueMicrotask(()=>{
      if(payload.action==='itemLookup'){
        const finished=payload.itemCode==='TEST-PILLOW';
        return this.success(payload.deviceToken==='test-token'?{ok:true,itemCode:payload.itemCode,itemName:finished?'Bantal Classic — DEMO':'Dacron — DEMO',itemType:finished?'FINISHED_GOODS':'RAW_MATERIAL',unit:finished?'pcs':'ball',stockAfter:finished?finishedStock:stock,todayQty:finished?0:2}:{ok:false,message:'Device not authorized'});
      }
      const duplicate=seen.has(payload.requestId);
      if(!duplicate){if(payload.itemCode==='TEST-PILLOW')finishedStock+=payload.action==='stockIn'?Number(payload.qty):-Number(payload.qty);else stock+=payload.action==='stockIn'?Number(payload.qty):-Number(payload.qty);seen.add(payload.requestId)}
      if(failFirstWrite){failFirstWrite=false;return this.failure(Error('Network reply lost'))}
      this.success({ok:true,duplicate,stockAfter:payload.itemCode==='TEST-PILLOW'?finishedStock:stock,
        movementType:payload.itemCode!=='TEST-PILLOW'&&payload.action==='stockIn'&&!payload.supplierDoc?'MATERIAL_ISSUE_CORRECTION_IN':undefined});
    });
  }
};
const storage={getItem:key=>pendingStore.get(key)||null,setItem:(key,val)=>pendingStore.set(key,val),removeItem:key=>pendingStore.delete(key)};
const document={getElementById:id=>elements[id],querySelectorAll:selector=>selector==='[data-step]'?steppers:[]};
vm.runInNewContext(script,{document,window:{google:{script:{run:scriptRun}}},google:{script:{run:scriptRun}},sessionStorage:storage,crypto,confirm:()=>true,queueMicrotask,Error,Promise,Number,Math,JSON,String,console});
const settle=async()=>{for(let i=0;i<5;i++)await Promise.resolve()};
elements.itemCode.value='TEST-DACRON';
elements.lookup.click();await settle();
assert.match(elements.status.textContent,/Aktifkan token/);
elements.deviceToken.value='test-token';elements.applyToken.click();
elements.lookup.click();await settle();
assert.equal(elements.itemName.textContent,'Dacron — DEMO');
elements.staffId.value='STAFF 1';elements.qty.value='4';elements.supplierDoc.value='TEST-INVOICE';
elements.stockIn.click();await settle();
assert.match(elements.status.textContent,/Network reply lost/);
assert.equal(elements.pending.style.display,'block');
const requestId=calls.at(-1).requestId;
elements.retry.click();await settle();
assert.equal(calls.at(-1).requestId,requestId,'Retry must use identical request ID');
assert.equal(seen.size,1,'A lost response must not add stock twice');
assert.equal(stock,27);
assert.equal(elements.qty.value,'');
assert.equal(elements.itemCode.value,'');
assert.equal(elements.supplierDoc.value,'');
assert.equal(elements.staffId.value,'');
assert.equal(elements.pending.style.display,'none');
assert.equal(storage.getItem('padova-v2-staff-staging-pending-v1'),null);
elements.itemCode.value='TEST-DACRON';elements.lookup.click();await settle();
assert.equal(elements.stockIn.textContent,'KOREKSI +','Raw material MASUK without supplier reference must show correction meaning');
elements.supplierDoc.value='SUPPLIER-123';elements.supplierDoc.listeners.input();
assert.equal(elements.stockIn.textContent,'MASUK','Supplier reference restores raw-material receipt action');
elements.supplierDoc.value='';elements.supplierDoc.listeners.input();
elements.staffId.value='STAFF 1';elements.qty.value='1';elements.stockIn.click();await settle();
assert.equal(stock,28,'Same-day material usage correction must restore stock');
assert.match(elements.status.textContent,/KOREKSI PEMAKAIAN/);
assert.equal(calls.at(-1).supplierDoc,'','Material usage correction must not create supplier data');
elements.itemCode.value='TEST-PILLOW';elements.lookup.click();await settle();
assert.equal(elements.supplierDocGroup.hidden,true,'Supplier reference must disappear for finished goods');
assert.equal(elements.stockOut.textContent,'KOREKSI −');
assert.match(elements.todayNote.textContent,/Selesai & dikemas hari ini/);
elements.staffId.value='STAFF 1';elements.qty.value='3';elements.stockIn.click();await settle();
assert.equal(finishedStock,7,'Completed production must increase finished stock once');
assert.equal(calls.at(-1).supplierDoc,'','Production must not require purchasing fields');
assert.equal(elements.qty.value,'','Production must reset the staff quantity input');
elements.itemCode.value='TEST-PILLOW';elements.lookup.click();await settle();
elements.staffId.value='STAFF 1';elements.qty.value='1';elements.stockOut.click();await settle();
assert.equal(finishedStock,6,'Same-day correction must reduce finished stock');
console.log('PASS: staff auth, retries, no prices, raw receipts/usage corrections, finished production/corrections, and form reset');
