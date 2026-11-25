import {initialState,balance,receiveGoods,savePurchase,unmatchedQty,postMovement,selectedReceiptQuantity} from './engine.mjs';
const KEY='padova-v2-demo-v1';const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state;try{const x=JSON.parse(localStorage.getItem(KEY));state=x?.items&&x?.receipts&&x?.purchases&&x?.movements?x:initialState()}catch{state=initialState()}
let editingId=null;
const itemName=code=>state.items.find(x=>x.code===code)?.name??code;
const options=()=>state.items.map(i=>`<option value="${esc(i.code)}">${esc(i.name)} (${esc(i.code)})</option>`).join('');
function persist(){localStorage.setItem(KEY,JSON.stringify(state));draw();}
function message(id,s,bad=false){const e=$(id);e.textContent=s;e.style.display='block';e.className='status'+(bad?' bad':'');}
function showStaff(show){$('staff').style.display=show?'block':'none';$('owner').style.display=show?'none':'block';$('staffTab').className=show?'active':'';$('ownerTab').className=show?'':'active';draw();}
function editPurchase(id){const p=state.purchases.find(x=>x.id===id);if(!p)return;editingId=id;$('supplier').value=p.supplier;$('invoice').value=p.invoice;$('purchaseItem').value=p.itemCode;$('invoiceQty').value=p.invoiceQty;$('unitCost').value=p.unitCost;draw();$('purchaseHeading').textContent='Edit Purchase';$('editNotice').style.display='block';$('purchaseButton').textContent='SAVE CHANGES';$('purchaseHeading').scrollIntoView({behavior:'smooth'});}
function newPurchase(){editingId=null;$('purchaseHeading').textContent='New Purchase';$('editNotice').style.display='none';$('purchaseButton').textContent='SAVE PURCHASE';$('supplier').value='DEMO SUPPLIER';$('invoice').value='';$('invoiceQty').value='';$('unitCost').value='';$('showAllReceipts').checked=false;draw();}
function checkedReceiptIds(){return [...document.querySelectorAll('.receiptPick:checked')].map(x=>x.dataset.id);}
function refreshQuantityRelation(){
 const ids=checkedReceiptIds();
 const selected=ids.length?selectedReceiptQuantity(state,ids,editingId):0;
 const entered=Number($('invoiceQty').value);
 const relation=ids.length&&entered>0&&selected!==entered?` Selected receipt qty ${selected}; purchasing qty ${entered}. Difference: ${Math.abs(selected-entered)}.`:'';
 $('matchQuantityNotice').textContent=relation;
}
function syncQuantityFromCheckedReceipts(){
 const ids=checkedReceiptIds();
 $('invoiceQty').value=ids.length?selectedReceiptQuantity(state,ids,editingId):'';
 refreshQuantityRelation();
}
function draw(){
 $('stockUnit').textContent=state.items.find(x=>x.code===$('stockItem').value)?.unit??'';
 $('stockList').innerHTML=state.items.map(i=>`<div class="line"><span><b>${esc(i.name)}</b><small>${esc(i.code)}</small></span><span class="summary">${balance(state,i.code)} <small style="display:inline">${esc(i.unit)}</small></span></div>`).join('');
 $('movementList').innerHTML=state.movements.slice(-5).reverse().map(m=>`<div class="line"><span>${esc(m.type.replaceAll('_',' '))}<small>${esc(itemName(m.itemCode))}</small></span><b>${m.type.includes('ISSUE')||m.type.includes('OUT')||m.type==='DISPATCH'?'−':'+'}${m.qty}</b></div>`).join('')||'<p class="muted">None yet</p>';
 $('unmatchedList').innerHTML=state.receipts.filter(r=>unmatchedQty(state,r.id)>0).map(r=>`<div class="line"><span>${esc(itemName(r.itemCode))}<small>Invoice/SO: ${esc(r.supplierDoc||'not supplied')}</small></span><b>${unmatchedQty(state,r.id)} available</b></div>`).join('')||'<p class="muted">All receipts matched, or no receipts yet.</p>';
 $('purchaseList').innerHTML=state.purchases.slice().reverse().map(p=>`<div class="line"><span><b>${esc(p.invoice)}</b><small>${esc(p.supplier)} · ${esc(itemName(p.itemCode))} · ${p.invoiceQty}</small><span class="pill ${p.status==='MATCHED'?'matched':''}">${esc(p.status)}</span></span><button data-edit="${esc(p.id)}">Edit</button></div>`).join('')||'<p class="muted">No purchases yet.</p>';
 document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>editPurchase(b.dataset.edit));
 const selected=state.purchases.find(p=>p.id===editingId);const current=selected?.receiptAllocations??[];
 const doc=$('invoice').value.trim().toUpperCase();
 const candidates=state.receipts.filter(r=>r.itemCode===$('purchaseItem').value&&(unmatchedQty(state,r.id)>0||current.some(a=>a.receiptId===r.id))&&($('showAllReceipts').checked||(doc&&String(r.supplierDoc||'').trim().toUpperCase()===doc)||current.some(a=>a.receiptId===r.id)));
 const suggested=candidates.filter(r=>doc&&String(r.supplierDoc||'').trim().toUpperCase()===doc);
 $('matchHint').textContent=suggested.length?`${suggested.length} receipt(s) found under this invoice number. Confirm by checking the box.`:'No matching receipt found under this invoice number. You may still save as Pending Matching or show other receipts.';
 $('receiptOptions').innerHTML=candidates.map(r=>{const prev=current.find(a=>a.receiptId===r.id)?.qty??0;const max=unmatchedQty(state,r.id)+prev;const match=doc&&String(r.supplierDoc||'').trim().toUpperCase()===doc;return `<label class="receipt"><input type="checkbox" class="receiptPick" data-id="${esc(r.id)}" ${prev?'checked':''}> <b>${esc(itemName(r.itemCode))} — ${max} ${esc(state.items.find(i=>i.code===r.itemCode)?.unit)} available</b><small>Supplier ref: ${esc(r.supplierDoc||'none')} ${match?'· Suggested match':'· Manual match'}</small></label>`}).join('');
 document.querySelectorAll('.receiptPick').forEach(box=>box.onchange=syncQuantityFromCheckedReceipts);
 const quantity=Number($('invoiceQty').value);
 const totalSuggested=suggested.reduce((n,r)=>n+unmatchedQty(state,r.id)+(current.find(a=>a.receiptId===r.id)?.qty??0),0);
 if(suggested.length&&quantity>0&&totalSuggested!==quantity)$('matchHint').textContent+=` Quantity discrepancy: invoice ${quantity}, available receipt quantity ${totalSuggested}. Review before saving.`;
 refreshQuantityRelation();
}
function selectedAllocations(){let remaining=Number($('invoiceQty').value);const existing=state.purchases.find(p=>p.id===editingId);return [...document.querySelectorAll('.receiptPick:checked')].map(e=>{const prev=existing?.receiptAllocations?.find(a=>a.receiptId===e.dataset.id)?.qty??0;const qty=Math.max(0,Math.min(remaining,unmatchedQty(state,e.dataset.id)+prev));remaining-=qty;return {receiptId:e.dataset.id,qty}}).filter(x=>x.qty>0);}
$('staffTab').onclick=()=>showStaff(true);$('ownerTab').onclick=()=>showStaff(false);$('stockItem').onchange=draw;$('purchaseItem').onchange=()=>{if(editingId){const p=state.purchases.find(x=>x.id===editingId);if(p&&p.itemCode!==$('purchaseItem').value)message('purchaseStatus','Changing items removes previous allocations; review before saving.',true)}draw()};
$('invoice').oninput=draw;$('showAllReceipts').onchange=draw;$('invoiceQty').oninput=refreshQuantityRelation;
document.querySelectorAll('[data-qty]').forEach(b=>b.onclick=()=>{$('stockQty').value=Math.max(0,(Number($('stockQty').value)||0)+Number(b.dataset.qty));});
$('clearQty').onclick=()=>{$('stockQty').value='';$('stockQty').focus()};$('stockQty').onclick=e=>e.target.select();
$('inButton').onclick=()=>{try{const r=receiveGoods(state,{itemCode:$('stockItem').value,qty:$('stockQty').value,staff:$('staffName').value,supplierDoc:$('supplierDoc').value.trim(),requestId:crypto.randomUUID()});persist();message('stockStatus',`Received ${r.receipt.qty}. Reference: ${r.receipt.supplierDoc||'not provided'}. Stock is now ${balance(state,r.receipt.itemCode)}.`)}catch(e){message('stockStatus',e.message,true)}};
$('outButton').onclick=()=>{try{postMovement(state,{itemCode:$('stockItem').value,qty:$('stockQty').value,staff:$('staffName').value,type:'MATERIAL_ISSUE',requestId:crypto.randomUUID()});persist();message('stockStatus',`Materials taken. Stock is now ${balance(state,$('stockItem').value)}.`)}catch(e){message('stockStatus',e.message,true)}};
$('purchaseButton').onclick=()=>{try{const p=savePurchase(state,{id:editingId,invoice:$('invoice').value.trim(),supplier:$('supplier').value.trim(),itemCode:$('purchaseItem').value,invoiceQty:$('invoiceQty').value,unitCost:$('unitCost').value,receiptAllocations:selectedAllocations()});persist();editPurchase(p.id);message('purchaseStatus',`Saved: ${p.status}. Stock unchanged.`)}catch(e){message('purchaseStatus',e.message,true)}};
$('newPurchase').onclick=newPurchase;
$('resetButton').onclick=()=>{if(confirm('Clear this browser\'s V2 demo data?')){state=initialState();editingId=null;persist();newPurchase();message('stockStatus','Demo reset.')}};
$('stockItem').innerHTML=options();$('purchaseItem').innerHTML=options();draw();
