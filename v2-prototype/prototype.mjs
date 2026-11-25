import {initialState,balance,receiveGoods,createPurchase,unmatchedQty,postMovement} from './engine.mjs';
const KEY='padova-v2-demo-v1';
const $=id=>document.getElementById(id);
const escape=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state;try{const saved=JSON.parse(localStorage.getItem(KEY));state=saved?.items&&saved?.receipts&&saved?.movements&&saved?.purchases?saved:initialState();}catch{state=initialState();}
function save(){localStorage.setItem(KEY,JSON.stringify(state));draw();}
function message(target,text,bad=false){target.textContent=text;target.className='status'+(bad?' bad':'');target.style.display='block';}
function itemOptions(){return state.items.map(i=>`<option value="${escape(i.code)}">${escape(i.name)} (${escape(i.code)})</option>`).join('');}
function init(){ $('stockItem').innerHTML=itemOptions();$('purchaseItem').innerHTML=itemOptions();draw();}
function draw(){
 $('stockUnit').textContent=state.items.find(x=>x.code===$('stockItem').value)?.unit??'';
 $('stockList').innerHTML=state.items.map(i=>`<div class="line"><div><b>${escape(i.name)}</b><br><small>${escape(i.code)}</small></div><div style="text-align:right"><span class="number">${balance(state,i.code)}</span> <small>${escape(i.unit)}</small></div></div>`).join('');
 $('movementList').innerHTML=state.movements.slice(-5).reverse().map(m=>`<div class="line"><div><b>${escape(m.type.replaceAll('_',' '))}</b><br><small>${escape(m.itemCode)}</small></div><b>${m.type.includes('ISSUE')||m.type.includes('OUT')||m.type==='DISPATCH'?'-':'+'}${m.qty}</b></div>`).join('')||'<p class="muted">No movements yet.</p>';
 const remaining=state.receipts.filter(r=>unmatchedQty(state,r.id)>0);
 $('unmatchedList').innerHTML=remaining.map(r=>`<div class="line"><div><b>${escape(r.itemCode)}</b><br><small>${escape(r.supplierDoc||'No supplier reference')}</small></div><b>${unmatchedQty(state,r.id)} remaining</b></div>`).join('')||'<p class="muted">No unmatched receipts.</p>';
 const candidates=remaining.filter(r=>r.itemCode===$('purchaseItem').value);
 $('receiptOptions').innerHTML=candidates.map(r=>`<label class="receipt-choice"><input type="checkbox" class="receiptPick" value="${escape(r.id)}"> ${escape(r.itemCode)} — ${unmatchedQty(state,r.id)} ${escape(state.items.find(i=>i.code===r.itemCode)?.unit)} available (${escape(r.supplierDoc||'unreferenced')})</label>`).join('')||'<p class="muted">No receipts available. The purchase may be saved as Pending Matching.</p>';
 $('purchaseList').innerHTML=state.purchases.slice().reverse().map(p=>`<div class="line"><div><b>${escape(p.invoice)}</b><br><small>${escape(p.supplier)} · ${escape(p.itemCode)} · ${p.invoiceQty} units</small></div><span class="tag ${p.status==='MATCHED'?'':'pending'}">${escape(p.status)}</span></div>`).join('')||'<p class="muted">No purchases yet.</p>';
}
$('staffTab').onclick=()=>{$('staff').style.display='block';$('owner').style.display='none';$('staffTab').className='active';$('ownerTab').className='';};
$('ownerTab').onclick=()=>{$('staff').style.display='none';$('owner').style.display='block';$('staffTab').className='';$('ownerTab').className='active';draw();};
$('stockItem').onchange=draw;$('purchaseItem').onchange=draw;
$('inButton').onclick=()=>{try{const r=receiveGoods(state,{itemCode:$('stockItem').value,qty:$('stockQty').value,staff:$('staffName').value,supplierDoc:$('supplierDoc').value,requestId:crypto.randomUUID()});save();message($('stockStatus'),`Goods received. Receipt ${r.receipt.id.slice(0,11)}… Stock is now ${balance(state,$('stockItem').value)}.`);}catch(e){message($('stockStatus'),e.message,true)}};
$('outButton').onclick=()=>{try{postMovement(state,{itemCode:$('stockItem').value,qty:$('stockQty').value,staff:$('staffName').value,type:'MATERIAL_ISSUE',requestId:crypto.randomUUID()});save();message($('stockStatus'),`Materials taken. Stock is now ${balance(state,$('stockItem').value)}.`);}catch(e){message($('stockStatus'),e.message,true)}};
$('purchaseButton').onclick=()=>{try{const selected=[...document.querySelectorAll('.receiptPick:checked')];let remaining=Number($('invoiceQty').value);const receiptAllocations=selected.map(el=>{const qty=Math.min(remaining,unmatchedQty(state,el.value));remaining-=qty;return {receiptId:el.value,qty};}).filter(a=>a.qty>0);const p=createPurchase(state,{invoice:$('invoice').value,supplier:$('supplier').value,itemCode:$('purchaseItem').value,invoiceQty:$('invoiceQty').value,unitCost:$('unitCost').value,receiptAllocations});save();message($('purchaseStatus'),`Purchase saved: ${p.status}. Current stock unchanged.`);}catch(e){message($('purchaseStatus'),e.message,true)}};
$('resetButton').onclick=()=>{if(confirm('Reset only the local PADOVA V2 DEMO?')){state=initialState();save();message($('stockStatus'),'Demo reset.');}};
init();
