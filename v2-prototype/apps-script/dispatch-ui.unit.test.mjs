import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const html=fs.readFileSync(new URL('./PADOVA_V2_Dispatch_Staging.html',import.meta.url),'utf8');
const visible=html.replace(/<style>[\s\S]*?<\/style>/,'').replace(/<script>[\s\S]*?<\/script>/,'');
assert.doesNotMatch(visible,/Harga Beli|Harga Jual|Unit Cost|Invoice Amount|Payment Status|Subtotal|Margin|Sales Amount/i);
assert.match(html,/Surat Jalan tetap ditulis\/dicetak seperti biasa/);
const controller=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(controller);new vm.Script(controller);
class El{
  constructor(id){this.id=id;this.value='';this.textContent='';this.className='';this.style={};this.disabled=false;this.hidden=false;this.checked=false;this.children=[];this.dataset={};this.listeners={};}
  addEventListener(type,fn){this.listeners[type]=fn}
  appendChild(e){this.children.push(e);return e}
  replaceChildren(...children){this.children=[...children];this.value=''}
  focus(){}select(){}click(){this.onclick?.()}
}
const ids=['ownerMode','authCard','ownerPanel','overrideGroup','deviceToken','activate','deviceState','staffId','soNo','findSO','soSummary','itemCode','itemSummary','sjNo','qty','evidence','override','confirmDispatch','status','pending','pendingDetail','retry','discard','availabilityRows','correctionDispatch','correctionQty','correctionReason','correct','refreshOwner','correctionStatus','correctionPending','retryCorrection','clearQty'];
const steps=[-1,1,5].map(n=>{const e=new El('step'+n);e.dataset.step=String(n);return e});
const so={so:{id:'SO-TEST-001',no:'SO-V2-001',status:'CONFIRMED',customer:'Fictional Customer'},items:[{itemCode:'TEST-PILLOW',itemName:'Bantal Classic — DEMO',unit:'pcs',ordered:7,shipped:0,remaining:7,onHand:8,dispatchable:4}]};
const ownerSnapshot={ok:true,availability:[{itemCode:'TEST-PILLOW',itemName:'Bantal Classic — DEMO',unit:'pcs',onHand:5,reserved:8,available:-3}],dispatches:[{id:'DSP-001',soNo:'SO-V2-001',sjNo:'SJ-001',itemCode:'TEST-PILLOW',qty:3,net:3,unit:'pcs'}]};
async function run(ownerMode){
 const elements=Object.fromEntries(ids.map(id=>[id,new El(id)]));elements.ownerMode.value=String(ownerMode);
 const storage=new Map(),seen=new Set(),calls=[];let stock=8,replyLost=true,correctionLost=true;
 const server={withSuccessHandler(success){return {...this,success}},withFailureHandler(failure){return {...this,failure}},v2StaffApi(payload){this.dispatch(payload)},v2OwnerApi(payload){this.dispatch(payload)},dispatch(payload){
   calls.push(payload);
   queueMicrotask(()=>{
     if(payload.action==='dispatchLookup')return this.success({ok:true,...so});
     if(payload.action==='dispatchSnapshot')return this.success(ownerSnapshot);
     if(payload.action==='dispatchConfirm'){
       const duplicate=seen.has(payload.requestId);
       if(!duplicate){stock-=Number(payload.qty);seen.add(payload.requestId)}
       if(replyLost){replyLost=false;return this.failure(Error('Reply lost'))}
       return this.success({ok:true,duplicate,stockAfter:stock,soRemaining:7-payload.qty});
     }
     if(payload.action==='dispatchCorrect'){
       const duplicate=seen.has(payload.requestId);
       if(!duplicate){stock+=Number(payload.qty);seen.add(payload.requestId)}
       if(correctionLost){correctionLost=false;return this.failure(Error('Correction reply lost'))}
       return this.success({ok:true,duplicate,stockAfter:stock,dispatchRemaining:2});
     }
     this.success({ok:false,message:'Unexpected action'});
   });
 }};
 const document={getElementById:id=>elements[id],createElement:type=>new El(type),querySelectorAll:selector=>selector==='[data-step]'?steps:[]};
 const sessionStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 vm.runInNewContext(controller,{document,sessionStorage,window:{google:{script:{run:server}}},google:{script:{run:server}},crypto,confirm:()=>true,queueMicrotask,Error,Promise,Number,Math,JSON,String,console});
 const settle=async()=>{for(let i=0;i<10;i++)await Promise.resolve()};
 await settle();
 if(!ownerMode){
   assert.equal(elements.ownerPanel.hidden,true);
   elements.soNo.value='SO-V2-001';elements.findSO.click();await settle();assert.match(elements.status.textContent,/token uji/i);
   elements.deviceToken.value='test-token';elements.activate.click();
 }
 elements.soNo.value='SO-V2-001';elements.findSO.click();await settle();
 assert.equal(elements.itemCode.value,'TEST-PILLOW');
 assert.match(elements.itemSummary.textContent,/Sisa SO: 7/);
 elements.staffId.value='STAFF-1';elements.sjNo.value='SJ-DEMO-001';elements.qty.value='3';elements.confirmDispatch.click();await settle();
 assert.match(elements.status.textContent,/Reply lost/);
 assert.equal(elements.pending.style.display,'block');
 const req=calls.findLast(c=>c.action==='dispatchConfirm').requestId;elements.retry.click();await settle();
 assert.equal(calls.findLast(c=>c.action==='dispatchConfirm').requestId,req);
 assert.equal(seen.size,1);
 assert.equal(stock,5);
 assert.equal(elements.soNo.value,'');assert.equal(elements.sjNo.value,'');assert.equal(elements.qty.value,'');assert.equal(elements.staffId.value,'');
 assert.equal(storage.get('padova-v2-dispatch-pending-v1'),undefined);
 if(ownerMode){
   assert.equal(elements.authCard.hidden,true);assert.equal(elements.ownerPanel.hidden,false);
   assert.equal(elements.availabilityRows.children.length,1);
   elements.correctionDispatch.value='DSP-001';elements.correctionQty.value='1';elements.correctionReason.value='Wrong count';elements.correct.click();await settle();
   assert.match(elements.correctionStatus.textContent,/Correction reply lost/);
   assert.equal(elements.correctionPending.style.display,'block');
   const first=calls.at(-1).requestId;elements.retryCorrection.click();await settle();
   assert.equal(calls.findLast(c=>c.action==='dispatchCorrect').requestId,first);
   assert.equal(seen.size,2);assert.equal(stock,6);
   assert.equal(storage.get('padova-v2-dispatch-correction-pending-v1'),undefined);
   assert.equal(elements.correctionQty.value,'');
 }
 return {calls,elements};
}
const staff=await run(false);
assert.ok(staff.calls.every(c=>!('unitCost' in c)&&!('price' in c)));
const owner=await run(true);
assert.ok(owner.calls.some(c=>c.action==='dispatchCorrect'));
console.log('PASS: quantity-only dispatch UI, private token, confirmed SO, stable request retries, reset, owner availability and corrections');
