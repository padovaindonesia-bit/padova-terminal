// PADOVA V2 staging prototype. Local demo data only; no production integrations.
export const DEMO_ITEMS = [{code:'HCSSP01',name:'Dacron',unit:'ball',opening:8},{code:'PEKM03',name:'Padding',unit:'ball',opening:1}];
export const MOVEMENT_TYPES = Object.freeze({GOODS_RECEIPT:1,PRODUCTION_FINISHED:1,MATERIAL_ISSUE:-1,DISPATCH:-1,CORRECTION_IN:1,CORRECTION_OUT:-1});
const validQty = q => Number.isFinite(Number(q)) && Number(q)>0;
const unique = (rows, field, id) => rows.some(row=>row[field]===id);
export function initialState(){return {items:structuredClone(DEMO_ITEMS),receipts:[],movements:[],purchases:[],corrections:[]};}
export function balance(state,code){const item=state.items.find(x=>x.code===code);if(!item)throw Error('Item not found');return item.opening+state.movements.filter(x=>x.itemCode===code&&x.status==='POSTED').reduce((n,x)=>n+MOVEMENT_TYPES[x.type]*x.qty,0);}
export function postMovement(state,entry){
  if(!state.items.some(x=>x.code===entry.itemCode))throw Error('Item not found');
  if(!validQty(entry.qty)||!MOVEMENT_TYPES[entry.type])throw Error('Invalid movement');
  if(!entry.requestId)throw Error('Request ID required');
  const prior=state.movements.find(x=>x.requestId===entry.requestId);
  if(prior)return {movement:prior,duplicate:true};
  const qty=Number(entry.qty);
  if(MOVEMENT_TYPES[entry.type]<0&&balance(state,entry.itemCode)<qty)throw Error('Insufficient stock');
  const movement={id:`MOV-${crypto.randomUUID()}`,requestId:entry.requestId,itemCode:entry.itemCode,type:entry.type,qty,ref:entry.ref??'',staff:entry.staff??'Staff',time:new Date().toISOString(),status:'POSTED'};
  state.movements.push(movement);
  return {movement,duplicate:false};
}
export function receiveGoods(state,{itemCode,qty,staff='Staff',supplierDoc='',requestId}){
  if(!requestId)throw Error('Request ID required');
  const existing=state.receipts.find(x=>x.requestId===requestId);
  if(existing)return {receipt:existing,duplicate:true};
  if(!validQty(qty))throw Error('Quantity must be positive');
  const receipt={id:`GR-${crypto.randomUUID()}`,requestId,itemCode,qty:Number(qty),staff,supplierDoc,time:new Date().toISOString()};
  const movement=postMovement(state,{itemCode,qty,type:'GOODS_RECEIPT',requestId,ref:receipt.id,staff});
  state.receipts.push(receipt);
  return {receipt,movement:movement.movement,duplicate:false};
}
export function unmatchedQty(state,receiptId){
  const receipt=state.receipts.find(x=>x.id===receiptId);if(!receipt)throw Error('Receipt not found');
  const used=state.purchases.reduce((n,p)=>n+(p.receiptAllocations??[]).filter(a=>a.receiptId===receiptId).reduce((k,a)=>k+a.qty,0),0);
  return Math.max(0,receipt.qty-used);
}
export function suggestedReceipts(state,{invoice,itemCode}){
  const reference=String(invoice??'').trim().toUpperCase();
  if(!reference)return [];
  return state.receipts.filter(r=>r.itemCode===itemCode&&String(r.supplierDoc??'').trim().toUpperCase()===reference&&unmatchedQty(state,r.id)>0);
}
export function selectedReceiptQuantity(state,receiptIds,editingPurchaseId=null){
  const existing=state.purchases.find(p=>p.id===editingPurchaseId);
  return [...new Set(receiptIds)].reduce((total,id)=>{
    const previouslyAllocated=existing?.receiptAllocations?.find(a=>a.receiptId===id)?.qty??0;
    return total+unmatchedQty(state,id)+previouslyAllocated;
  },0);
}
export function commonSupplierReference(state,receiptIds){
  const selected=[...new Set(receiptIds)].map(id=>state.receipts.find(r=>r.id===id));
  if(!selected.length||selected.some(r=>!r?.supplierDoc?.trim()))return null;
  const normalized=[...new Set(selected.map(r=>r.supplierDoc.trim().toUpperCase()))];
  return normalized.length===1?selected[0].supplierDoc.trim():null;
}
export function savePurchase(state,{id=null,invoice,supplier,itemCode,invoiceQty,unitCost,receiptAllocations=[],autoMatch=false}){
  if(!invoice||!supplier||!state.items.some(x=>x.code===itemCode)||!validQty(invoiceQty)||!Number.isFinite(Number(unitCost))||Number(unitCost)<0)throw Error('Complete supplier, invoice, item, quantity and cost');
  const existing=id?state.purchases.find(p=>p.id===id):null;
  if(id&&!existing)throw Error('Purchase not found');
  if(state.purchases.some(p=>p.id!==id&&p.invoice===invoice&&p.supplier===supplier&&p.itemCode===itemCode))throw Error('Purchase already exists. Edit that record instead.');
  // Reconcile the *saved* supplier reference, not only checkbox state in the browser.
  // Existing allocations from this purchase are temporarily available for re-matching.
  if(autoMatch){
    let remaining=Number(invoiceQty);
    const key=String(invoice).trim().toUpperCase();
    receiptAllocations=state.receipts.filter(r=>r.itemCode===itemCode&&String(r.supplierDoc??'').trim().toUpperCase()===key).map(r=>{
      const previous=existing?.receiptAllocations?.find(a=>a.receiptId===r.id)?.qty??0;
      const qty=Math.max(0,Math.min(remaining,unmatchedQty(state,r.id)+previous));
      remaining-=qty;
      return {receiptId:r.id,qty};
    }).filter(a=>a.qty>0);
  }
  const seen=new Set();let totalAllocated=0;
  for(const a of receiptAllocations){
    if(seen.has(a.receiptId))throw Error('Receipt selected twice');seen.add(a.receiptId);
    const r=state.receipts.find(x=>x.id===a.receiptId);
    const previouslyAllocated=existing?.receiptAllocations?.find(x=>x.receiptId===a.receiptId)?.qty??0;
    if(!r||r.itemCode!==itemCode||!validQty(a.qty)||Number(a.qty)>unmatchedQty(state,a.receiptId)+previouslyAllocated)throw Error('Receipt allocation exceeds available quantity');
    totalAllocated+=Number(a.qty);
  }
  if(totalAllocated>Number(invoiceQty))throw Error('Allocated quantity exceeds invoice quantity');
  const sourceQty=receiptAllocations.reduce((n,a)=>{
    const r=state.receipts.find(x=>x.id===a.receiptId);
    const otherPurchasesUsed=state.purchases.filter(p=>p.id!==id).reduce((k,p)=>k+(p.receiptAllocations??[]).filter(v=>v.receiptId===a.receiptId).reduce((j,v)=>j+v.qty,0),0);
    return n+(r?.qty??0)-otherPurchasesUsed;
  },0);
  const status=totalAllocated===0?'PENDING MATCHING':totalAllocated===Number(invoiceQty)&&sourceQty===Number(invoiceQty)?'MATCHED':'PARTIALLY MATCHED';
  const purchase={id:id??`PUR-${crypto.randomUUID()}`,invoice,supplier,itemCode,invoiceQty:Number(invoiceQty),unitCost:Number(unitCost),receiptAllocations:receiptAllocations.map(a=>({receiptId:a.receiptId,qty:Number(a.qty)})),status,time:existing?.time??new Date().toISOString(),updatedAt:new Date().toISOString()};
  if(existing)Object.assign(existing,purchase);else state.purchases.push(purchase); // No stock movement, ever.
  return purchase;
}
export const createPurchase=(state,args)=>savePurchase(state,args);
export function correctReceipt(state,{receiptId,correctQty,reason,owner='OWNER'}){
  const receipt=state.receipts.find(r=>r.id===receiptId);
  if(!receipt||!validQty(correctQty)||!reason?.trim())throw Error('Select receipt, corrected quantity, and reason');
  const allocated=receipt.qty-unmatchedQty(state,receiptId);
  if(Number(correctQty)<allocated)throw Error('Corrected receipt cannot be less than quantity already matched to purchases');
  const delta=Number(correctQty)-receipt.qty;
  if(delta===0)return receipt;
  // Correct stock via a new, traceable movement; do not erase the original receipt or movement.
  postMovement(state,{itemCode:receipt.itemCode,qty:Math.abs(delta),type:delta>0?'CORRECTION_IN':'CORRECTION_OUT',requestId:crypto.randomUUID(),ref:receipt.id,staff:owner});
  (state.corrections??=[]).push({receiptId,oldQty:receipt.qty,newQty:Number(correctQty),reason:reason.trim(),owner,time:new Date().toISOString()});
  receipt.qty=Number(correctQty);
  return receipt;
}
