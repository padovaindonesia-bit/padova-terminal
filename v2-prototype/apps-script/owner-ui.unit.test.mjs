import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const html=fs.readFileSync(new URL('./PADOVA_V2_Owner_Staging.html',import.meta.url),'utf8');
assert.match(html,/Match Goods Receipt/);
assert.match(html,/Supplier Invoice No\./);
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script);
new vm.Script(script);

class Element {
  constructor(id){
    this.id=id;this.value='';this.textContent='';this.innerHTML='';this.className='';this.disabled=false;
    this.checked=false;this.open=false;this.dataset={};this.style={};this.classes=new Set();
    this.classList={add:x=>this.classes.add(x),remove:x=>this.classes.delete(x),toggle:(x,force)=>force?this.classes.add(x):this.classes.delete(x)};
  }
  scrollIntoView(){}
  click(){if(!this.disabled)this.onclick?.()}
}
const ids=['heading','editNotice','supplier','invoice','item','stockQty','unit','unitCost','matchHint','receiptOptions','quantityNotice',
  'showAll','details','supplierQty','supplierUnit','invoiceDate','amountOverride','notes','save','new','status','pending','pendingTitle','pendingHint','retry','cancelPending','unmatched','history'];
const elements=Object.fromEntries(ids.map(id=>[id,new Element(id)]));
const cache=new Map();
const dynamic=selector=>{
  const host=selector==='.pick'?'receiptOptions':selector==='[data-use]'?'unmatched':'history';
  const html=elements[host].innerHTML;
  if(cache.get(selector)?.html===html)return cache.get(selector).elements;
  const pattern=selector==='.pick'?/<input class="pick"[^>]*data-id="([^"]+)"([^>]*)>/g:selector==='[data-use]'?/data-use="([^"]+)"/g:/data-edit="([^"]+)"/g;
  const result=[...html.matchAll(pattern)].map(match=>{
    const e=new Element('dynamic');e.dataset[selector==='.pick'?'id':selector==='[data-use]'?'use':'edit']=match[1];
    e.checked=selector==='.pick'&&match[2].includes('checked');return e;
  });
  cache.set(selector,{html,elements:result});return result;
};
const document={getElementById:id=>elements[id],querySelectorAll:selector=>selector==='input,select,textarea'?Object.values(elements):dynamic(selector)};
const map=new Map(),calls=[],seen=new Set();
const storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
let failFirstSave=true;
const current={items:[{code:'TEST-DACRON',name:'Dacron — DEMO',unit:'ball',stock:23}],
  receipts:[{id:'GR-X1',itemCode:'TEST-DACRON',supplierDoc:'INV-1111',qty:20,netQty:20,unit:'ball',availableQty:20,recordedBy:'Staff'}],purchases:[]};
const runner={withSuccessHandler(success){return {...this,success}},withFailureHandler(failure){return {...this,failure}},v2OwnerApi(payload){
  queueMicrotask(()=>{
    if(payload.action==='snapshot')return this.success({ok:true,...current});
    calls.push(payload);
    if(!seen.has(payload.requestId)){
      seen.add(payload.requestId);
      const id=payload.purchaseId||'PUR-NEW-1',index=current.purchases.findIndex(p=>p.id===id);
      const matched=payload.manualOverride?payload.receiptIds.length>0:payload.invoice==='INV-1111';
      const purchase={id,supplier:payload.supplier,invoice:payload.invoice,itemCode:payload.itemCode,stockQty:Number(payload.stockQty),
        stockUnit:'ball',supplierQty:Number(payload.supplierQty)||Number(payload.stockQty),supplierUnit:payload.supplierUnit||'ball',invoiceDate:'2026-11-25',
        unitCost:payload.unitCost===''?'':Number(payload.unitCost),invoiceAmount:'',notes:'',mode:payload.manualOverride?'MANUAL':'AUTO',
        status:matched?'MATCHED':'PENDING MATCHING',matchedQty:matched?Number(payload.stockQty):0,allocations:matched?[{receiptId:'GR-X1',qty:Number(payload.stockQty)}]:[]};
      if(index>=0)current.purchases[index]=purchase;else current.purchases.push(purchase);
    }
    if(failFirstSave){failFirstSave=false;return this.failure(Error('Network reply lost'))}
    this.success({ok:true,duplicate:calls.length>1,purchaseId:'PUR-NEW-1',...current});
  });
}};
vm.runInNewContext(script,{document,google:{script:{run:runner}},sessionStorage:storage,crypto,confirm:()=>true,queueMicrotask,
  Number,Math,JSON,String,Error,Promise,Set,console});
const settle=async()=>{for(let n=0;n<12;n++)await Promise.resolve()};
await settle();
elements.supplier.value='Demo Supplier';elements.item.value='TEST-DACRON';elements.item.onchange();
elements.invoice.value='WRONG';elements.invoice.oninput();
assert.equal(elements.receiptOptions.innerHTML,'');
elements.invoice.value='INV-1111';elements.invoice.oninput();
assert.equal(elements.stockQty.value,20,'Correct supplier reference must populate operational qty');
const receiptPick=dynamic('.pick')[0];assert.ok(receiptPick);
receiptPick.checked=true;receiptPick.onchange();
assert.equal(elements.invoice.value,'INV-1111','Checking receipt must keep supplier invoice synchronized');
assert.equal(elements.stockQty.value,20,'Checking receipt must keep quantity synchronized');
elements.stockQty.value='15';elements.stockQty.oninput();
assert.match(elements.quantityNotice.textContent,/Difference: 5/);
elements.save.click();await settle();
assert.match(elements.status.textContent,/Network reply lost/);
assert.equal(elements.pendingTitle.textContent,'Save confirmation uncertain','Warning appears only after an uncertain response');
const req=calls[0].requestId;
elements.retry.click();await settle();
assert.equal(calls[1].requestId,req,'Ambiguous-save retry must reuse request ID');
assert.equal(seen.size,1,'Duplicate request must not create another purchase');
assert.equal(elements.invoice.value,'','Successful save must clear the owner form');
assert.equal(elements.stockQty.value,'','Successful save must clear quantity');
assert.equal(elements.supplier.value,'','Successful save must clear supplier');
assert.equal(storage.getItem('padova-v2-owner-pending-v1'),null);

// Reproduce the original bug: correcting a wrong invoice should auto-match on
// SAVE CHANGES even if no receipt checkbox is checked.
const editButton=dynamic('[data-edit]')[0];assert.ok(editButton);editButton.click();
elements.invoice.value='WRONG';elements.invoice.oninput();
elements.invoice.value='INV-1111';elements.invoice.oninput();
elements.save.click();await settle();
assert.equal(calls.at(-1).purchaseId,'PUR-NEW-1');
assert.equal(calls.at(-1).invoice,'INV-1111');
assert.equal(calls.at(-1).manualOverride,false,'Changing invoice manually should restore auto-match');
assert.equal(current.items[0].stock,23,'Owner purchasing must not change stock');
current.purchases[0].invoiceAmount=90000;current.purchases[0].supplierQty=30;current.purchases[0].supplierUnit='kg';
current.purchases[0].unitCost=2000;
dynamic('[data-edit]')[0].click();
assert.equal(elements.amountOverride.value,90000,'Editing a purchase must preserve an explicit invoice amount override');
console.log('PASS: owner UI invoice + receipt + quantity synchronization, edit reconciliation, retry, reset, and no stock change');
