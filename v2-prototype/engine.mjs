// PADOVA V2 staging prototype. Local demo data only; no production integrations.
export const DEMO_ITEMS = [{code:'HCSSP01',name:'Dacron',unit:'ball',opening:8},{code:'PEKM03',name:'Padding',unit:'ball',opening:1}];
export const MOVEMENT_TYPES = Object.freeze({GOODS_RECEIPT:1,PRODUCTION_FINISHED:1,MATERIAL_ISSUE:-1,DISPATCH:-1,CORRECTION_IN:1,CORRECTION_OUT:-1});
const validQty = q => Number.isFinite(Number(q)) && Number(q)>0;
const unique = (rows, field, id) => rows.some(row=>row[field]===id);
export function initialState(){return {items:structuredClone(DEMO_ITEMS),receipts:[],movements:[],purchases:[]};}
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
export function createPurchase(state,{invoice,supplier,itemCode,invoiceQty,unitCost,receiptAllocations=[]}){
  if(!invoice||!supplier||!state.items.some(x=>x.code===itemCode)||!validQty(invoiceQty)||!Number.isFinite(Number(unitCost))||Number(unitCost)<0)throw Error('Complete supplier, invoice, item, quantity and cost');
  if(unique(state.purchases,'invoice',invoice)&&state.purchases.some(p=>p.invoice===invoice&&p.supplier===supplier&&p.itemCode===itemCode))throw Error('Purchase line already recorded');
  const seen=new Set();let totalAllocated=0;
  for(const a of receiptAllocations){
    if(seen.has(a.receiptId))throw Error('Receipt selected twice');seen.add(a.receiptId);
    const r=state.receipts.find(x=>x.id===a.receiptId);if(!r||r.itemCode!==itemCode||!validQty(a.qty)||Number(a.qty)>unmatchedQty(state,a.receiptId))throw Error('Invalid receipt allocation');
    totalAllocated+=Number(a.qty);
  }
  if(totalAllocated>Number(invoiceQty))throw Error('Allocated quantity exceeds invoice quantity');
  const purchase={id:`PUR-${crypto.randomUUID()}`,invoice,supplier,itemCode,invoiceQty:Number(invoiceQty),unitCost:Number(unitCost),receiptAllocations:receiptAllocations.map(a=>({receiptId:a.receiptId,qty:Number(a.qty)})),status:totalAllocated===Number(invoiceQty)?'MATCHED':totalAllocated===0?'PENDING MATCHING':'PARTIALLY MATCHED',time:new Date().toISOString()};
  state.purchases.push(purchase); // Deliberately no stock movement here.
  return purchase;
}
