/**
 * PADOVA V2 — INVENTORY STAGING ONLY
 * Do not replace the existing PADOVA Terminal Apps Script with this file.
 *
 * - Only the dedicated V2 sandbox spreadsheet is allowed.
 * - Public web endpoint supports staff stock movements only, authenticated by a
 *   private device token. It never returns or accepts prices/payments.
 * - Owner purchasing is restricted to the signed-in Padova owner only.
 *   It never posts inventory movements: stock comes from physical receipts.
 * - All changes use immutable event rows + stable clientRequestId.
 * - No source of stock other than POSTED Stock Movements.
 */
const V2_STAGING_SPREADSHEET_ID = '1nVvEU51gktNpt8T4XDaokqw33O-yVgbyEWx4D62OBuI';
const V2_OWNER_EMAIL = 'padovaindonesia@gmail.com';
const V2_HEADER = {
  'Goods Receipts': ['Receipt ID','Received Date','Item Code','Qty Received','Unit','Supplier','Supplier Doc Ref','Recorded By','Status','Linked Purchase ID','Notes','Client Request ID'],
  'Receipt Reversals': ['Reversal ID','Date','Receipt ID','Item Code','Qty','Supplier Doc Ref','Staff ID','Client Request ID'],
  'Stock Movements': ['Movement ID','Request ID','Movement Date','Item Code','Movement Type','Direction','Qty','Unit','Source Ref','Recorded By','Status','Reason'],
  'Purchase Receipt Links': ['Link ID','Purchase ID','Receipt ID','Item Code','Matched Qty','Linked At','Purchase Revision'],
  'Purchasing': ['Purchase ID','Supplier','Supplier Invoice No','Invoice Date','Item Code','Invoice Qty','Invoice Unit','Stock Qty','Stock Unit','Unit Cost','Invoice Amount','Goods Receipt ID','Payment Status','Notes','Match Status','Updated At','Client Request ID','Revision','Payload Hash','Match Mode'],
  'Purchase Save Requests': ['Client Request ID','Purchase ID','Payload Hash','Saved At','Revision']
};
// These editor functions are ALSO visible to google.script.run when HTML is
// hosted here. Always enforce the owner's signed-in identity on the server.
function setupPadovaV2Staging(){v2AuthorizeOwner_();return v2InitializeStaging_()}
function provisionPadovaV2TestDevice(){v2AuthorizeOwner_();return v2ProvisionStagingDevice_()}
function v2AuthorizeOwner_(){
  const email=String(Session.getActiveUser().getEmail()||'').trim().toLowerCase();
  if(email!==V2_OWNER_EMAIL)throw Error('Only the Padova owner can perform this action');
}

/** Run once from the owner-controlled Apps Script editor on a staging copy. */
function v2InitializeStaging_() {
  const ss = v2Open_();
  Object.keys(V2_HEADER).forEach(function(name){
    let sheet=ss.getSheetByName(name);
    if(!sheet)sheet=ss.insertSheet(name);
    const expected=V2_HEADER[name];
    const actual=sheet.getRange(1,1,1,expected.length).getDisplayValues()[0];
    expected.forEach(function(label,i){
      if(actual[i] && actual[i]!==label && !(name==='Goods Receipts' && i===11 && actual[i]==='')){
        throw Error('Unexpected header in '+name+' column '+(i+1)+': '+actual[i]);
      }
      if(!actual[i])sheet.getRange(1,i+1).setValue(label);
    });
  });
  return 'Staging tables ready';
}

/**
 * Owner-only provisioning. Run from script editor, then privately enter the
 * resulting token on the test device. Never place the token in GitHub or URLs.
 */
function v2ProvisionStagingDevice_() {
  const token=Utilities.getUuid()+'-'+Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperty('PADOVA_V2_STAGING_DEVICE_SHA256',v2Hash_(token));
  Logger.log('ONE-TIME STAGING DEVICE TOKEN (keep private): '+token);
  return 'Token generated. Copy it privately from the execution log.';
}

function doGet(e) {
  // /dev is a private, editor-only test deployment. The versioned /exec
  // deployment is also restricted to the owner. Never use this with live data.
  if(e&&e.parameter&&e.parameter.ui==='staff'){
    return HtmlService.createHtmlOutputFromFile('PADOVA_V2_Staff_Staging')
      .setTitle('PADOVA V2 — Staff Staging');
  }
  if(e&&e.parameter&&e.parameter.ui==='owner'){
    v2AuthorizeOwner_();
    return HtmlService.createHtmlOutputFromFile('PADOVA_V2_Owner_Staging')
      .setTitle('PADOVA V2 — Owner Purchasing Staging');
  }
  return v2Json_({ok:true,app:'PADOVA V2 inventory staging',status:'test-only'});
}

function doPost(e) {
  try{return v2Json_(v2StaffApi(JSON.parse(e?.postData?.contents||'{}')))}
  catch(err){return v2Json_({ok:false,message:String(err&&err.message||err)})}
}

/** The only public staff bridge exposed to HTMLService/google.script.run. */
function v2StaffApi(body){
  try{
    if(!body||typeof body!=='object')throw Error('Invalid request');
    v2AuthorizeStaff_(body.deviceToken);
    if(body.action==='itemLookup'){
      const ss=v2Open_(),item=v2FindItem_(ss,body.itemCode);
      return {ok:true,itemCode:item.itemCode,itemName:item.itemName,unit:item.unit,stockAfter:v2Stock_(ss,item)};
    }
    if(!body.requestId||!body.staffId)throw Error('Request ID and staff ID required');
    if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(String(body.requestId))){
      throw Error('Invalid request ID');
    }
    const result=body.action==='stockIn'?v2Receive_(body):body.action==='stockOut'?v2StockOut_(body):null;
    if(!result)throw Error('Unsupported staff action');
    return Object.assign({ok:true},result);
  }catch(err){return {ok:false,message:String(err&&err.message||err)}}
}

function v2Json_(value){return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON)}
function v2Hash_(s){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(s)).map(function(b){return ('0'+(b&255).toString(16)).slice(-2)}).join('')}
function v2AuthorizeStaff_(token){
  const expected=PropertiesService.getScriptProperties().getProperty('PADOVA_V2_STAGING_DEVICE_SHA256');
  if(!expected||!token||v2Hash_(token)!==expected)throw Error('Device not authorized');
}
// Staff-entered references are text, never spreadsheet formulas. Keep the
// visible supplier reference as entered; strip only the safe apostrophe when
// comparing it with a previously stored reference.
function v2SafeText_(input,maxLength){
  const value=String(input??'').trim();
  if(value.length>(maxLength||100))throw Error('Entered text is too long');
  if(/[\r\n\t]/.test(value))throw Error('Use a single line of text');
  return /^[=+\-@]/.test(value)?"'"+value:value;
}
function v2Open_(){
  const ss=SpreadsheetApp.openById(V2_STAGING_SPREADSHEET_ID);
  if(ss.getId()!==V2_STAGING_SPREADSHEET_ID)throw Error('Not the V2 sandbox');
  return ss;
}
function v2Sheet_(ss,name){const sheet=ss.getSheetByName(name);if(!sheet)throw Error('Missing staging sheet: '+name);return sheet}
function v2Rows_(sheet,n){const last=sheet.getLastRow();return last<2?[]:sheet.getRange(2,1,last-1,n).getValues()}
function v2Id_(prefix){return prefix+'-'+Utilities.getUuid()}
function v2Qty_(q){const n=Number(q);if(!Number.isFinite(n)||n<=0)throw Error('Quantity must be greater than zero');return n}
function v2Code_(s){return String(s||'').trim().toUpperCase()}
function v2Ref_(s){return String(s||'').trim().replace(/^'(?=[=+\-@])/,'').toUpperCase()}
function v2Lock_(action){
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{const ss=v2Open_();const result=action(ss);SpreadsheetApp.flush();return result}
  finally{lock.releaseLock()}
}
function v2FindItem_(ss,code){
  const item=v2Rows_(v2Sheet_(ss,'Item Master'),7).find(r=>v2Code_(r[0])===v2Code_(code));
  if(!item||String(item[5]).toUpperCase()!=='YES')throw Error('Item not active or not found');
  return {itemCode:String(item[0]),itemName:String(item[1]),unit:String(item[3]),opening:Number(item[4])||0};
}
function v2Movement_(ss,requestId){return v2Rows_(v2Sheet_(ss,'Stock Movements'),12).find(r=>String(r[1])===String(requestId))}
function v2Stock_(ss,item){
  const code=v2Code_(item.itemCode);
  return item.opening+v2Rows_(v2Sheet_(ss,'Stock Movements'),12).reduce(function(total,r){
    if(v2Code_(r[3])!==code||r[10]!=='POSTED')return total;
    return total+(r[5]==='IN'?1:-1)*Number(r[6]||0);
  },0);
}
function v2AppendMovement_(ss,requestId,item,type,direction,qty,source,staff,reason){
  const previous=v2Movement_(ss,requestId);
  if(previous){
    if(previous[4]!==type||v2Code_(previous[3])!==v2Code_(item.itemCode)||Number(previous[6])!==qty)throw Error('Request ID reused for a different stock transaction');
    return {id:String(previous[0]),duplicate:true,stock:v2Stock_(ss,item)};
  }
  const current=v2Stock_(ss,item);
  if(direction==='OUT'&&current<qty)throw Error('Insufficient stock');
  const id=v2Id_('MOV');
  v2Sheet_(ss,'Stock Movements').appendRow([id,requestId,new Date(),item.itemCode,type,direction,qty,item.unit,source,staff,'POSTED',reason||'']);
  return {id,duplicate:false,stock:current+(direction==='IN'?qty:-qty)};
}
function v2ReceiptByRequest_(ss,req){return v2Rows_(v2Sheet_(ss,'Goods Receipts'),12).find(r=>String(r[11])===String(req))}
function v2Receive_(body){return v2Lock_(function(ss){
  const item=v2FindItem_(ss,body.itemCode),qty=v2Qty_(body.qty),req=String(body.requestId),staff=v2SafeText_(body.staffId,80),doc=v2SafeText_(body.supplierDoc,120);
  const previous=v2Movement_(ss,req);
  if(previous&&(previous[4]!=='GOODS_RECEIPT'||v2Code_(previous[3])!==v2Code_(item.itemCode)||Number(previous[6])!==qty))throw Error('Request ID already used for a different transaction');
  let receipt=v2ReceiptByRequest_(ss,req);
  if(previous&&!receipt)throw Error('Previous receipt record missing; ask owner to review');
  if(receipt&&v2Ref_(receipt[6])!==v2Ref_(doc))throw Error('Request ID reused with a different supplier reference');
  if(!receipt){
    const id=v2Id_('GR');
    receipt=[id,new Date(),item.itemCode,qty,item.unit,'',doc,staff,'ACTIVE','','',req];
    v2Sheet_(ss,'Goods Receipts').appendRow(receipt);
  }
  const movement=v2AppendMovement_(ss,req,item,'GOODS_RECEIPT','IN',Number(receipt[3]),String(receipt[0]),staff,'');
  return {receiptId:String(receipt[0]),movementId:movement.id,duplicate:movement.duplicate,stockAfter:movement.stock};
})}

function v2ReversedQty_(ss,receiptId){return v2Rows_(v2Sheet_(ss,'Receipt Reversals'),8).filter(r=>String(r[2])===String(receiptId)).reduce((n,r)=>n+Number(r[4]||0),0)}
function v2AllocatedQty_(ss,receiptId){return v2OwnerData_(ss).receipts.find(r=>r.id===String(receiptId))?.allocatedQty||0}
function v2OutReceipt_(ss,body,item,qty){
  const req=String(body.requestId),reference=v2Ref_(body.supplierDoc),staff=v2SafeText_(body.staffId,80);
  // Crash recovery: a movement may have been written before its reversal rows.
  const existing=v2Movement_(ss,req);
  if(existing){
    if(existing[4]!=='CORRECTION_OUT'||v2Code_(existing[3])!==v2Code_(item.itemCode)||Number(existing[6])!==qty)throw Error('Request ID already used for another action');
    const priorPlan=JSON.parse(String(existing[8]||'[]'));
    const receiptRows=v2Rows_(v2Sheet_(ss,'Goods Receipts'),12);
    if(priorPlan.some(a=>!receiptRows.some(r=>String(r[0])===String(a.receiptId)&&v2Ref_(r[6])===reference))){
      throw Error('Request ID reused with a different supplier reference');
    }
    v2EnsureReversals_(ss,priorPlan,item,body);
    return {duplicate:true,movementId:String(existing[0]),stockAfter:v2Stock_(ss,item)};
  }
  let remaining=qty;
  const activeAllocations=new Map(v2OwnerData_(ss).receipts.map(r=>[r.id,r.allocatedQty]));
  const lines=v2Rows_(v2Sheet_(ss,'Goods Receipts'),12).filter(r=>v2Code_(r[2])===v2Code_(item.itemCode)&&v2Ref_(r[6])===reference).reverse();
  const allocation=[];
  for(const r of lines){
    const available=Number(r[3])-v2ReversedQty_(ss,r[0])-(activeAllocations.get(String(r[0]))||0);
    const take=Math.min(remaining,Math.max(0,available));
    if(take>0){allocation.push({receiptId:String(r[0]),qty:take});remaining-=take}
    if(remaining<=0)break;
  }
  if(remaining>0)throw Error('No sufficient unmatched receipt for this invoice and item; ask owner to review');
  // The posted movement stores the full reversal plan. Should subsequent sheet
  // writes fail, a retry uses this same plan rather than deducting again.
  const movement=v2AppendMovement_(ss,req,item,'CORRECTION_OUT','OUT',qty,JSON.stringify(allocation),staff,'Receipt correction');
  v2EnsureReversals_(ss,allocation,item,body);
  return {movementId:movement.id,duplicate:movement.duplicate,stockAfter:movement.stock,reversedReceiptIds:allocation.map(a=>a.receiptId)};
}
function v2EnsureReversals_(ss,allocation,item,body){
  const req=String(body.requestId),staff=v2SafeText_(body.staffId,80),doc=v2SafeText_(body.supplierDoc,120);
  const sheet=v2Sheet_(ss,'Receipt Reversals');
  const done=v2Rows_(sheet,8).filter(r=>String(r[7])===req);
  allocation.forEach(function(a){
    if(!done.some(r=>String(r[2])===String(a.receiptId))){
      sheet.appendRow([v2Id_('REV'),new Date(),a.receiptId,item.itemCode,a.qty,doc,staff,req]);
    }
  });
}
function v2StockOut_(body){return v2Lock_(function(ss){
  const item=v2FindItem_(ss,body.itemCode),qty=v2Qty_(body.qty),req=String(body.requestId),staff=v2SafeText_(body.staffId,80);
  if(v2Ref_(body.supplierDoc))return v2OutReceipt_(ss,body,item,qty);
  const existing=v2Movement_(ss,req);
  if(existing){
    if(existing[4]!=='MATERIAL_ISSUE'||v2Code_(existing[3])!==v2Code_(item.itemCode)||Number(existing[6])!==qty){
      throw Error('Request ID already used for a different stock transaction');
    }
    return {movementId:String(existing[0]),duplicate:true,stockAfter:v2Stock_(ss,item)};
  }
  const movement=v2AppendMovement_(ss,req,item,'MATERIAL_ISSUE','OUT',qty,'',staff,'');
  return {movementId:movement.id,duplicate:movement.duplicate,stockAfter:movement.stock};
})}

/**
 * Owner purchasing bridge. Even though this is called by an owner-only page,
 * every RPC checks the active signed-in identity on the SERVER. Never allow
 * stock movement, payment, or arbitrary sheet actions through this function.
 */
function v2OwnerApi(body){
  try{
    v2AuthorizeOwner_();
    if(!body||typeof body!=='object')throw Error('Invalid owner request');
    if(body.action==='snapshot')return Object.assign({ok:true},v2OwnerData_(v2Open_()));
    if(body.action==='savePurchase')return v2SavePurchase_(body);
    throw Error('Unsupported owner action');
  }catch(err){return {ok:false,message:String(err&&err.message||err)}}
}
function v2PurchaseNumber_(value,label,allowZero){
  const n=Number(value);
  if(!Number.isFinite(n)||(allowZero?n<0:n<=0))throw Error('Invalid '+label);
  return n;
}
function v2Date_(value){
  const s=String(value||'').trim();
  if(!s)return Utilities.formatDate(new Date(),'Asia/Jakarta','yyyy-MM-dd');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s))throw Error('Use YYYY-MM-DD for invoice date');
  return s;
}
function v2ValidRequest_(requestId){
  const s=String(requestId||'');
  if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(s))throw Error('Invalid request ID');
  return s;
}
function v2OwnerData_(ss){
  const items=v2Rows_(v2Sheet_(ss,'Item Master'),7)
    .filter(r=>v2Code_(r[5])==='YES')
    .map(r=>({code:String(r[0]),name:String(r[1]),unit:String(r[3]),stock:v2Stock_(ss,{itemCode:r[0],opening:Number(r[4])||0})}));
  const reversed=new Map();
  v2Rows_(v2Sheet_(ss,'Receipt Reversals'),8).forEach(r=>reversed.set(String(r[2]),(reversed.get(String(r[2]))||0)+Number(r[4]||0)));
  const receipts=v2Rows_(v2Sheet_(ss,'Goods Receipts'),12).filter(r=>String(r[0]||'')).map(r=>({
    id:String(r[0]),itemCode:String(r[2]),qty:Number(r[3])||0,unit:String(r[4]),
    supplierDoc:String(r[6]||''),receivedAt:String(r[1]||''),recordedBy:String(r[7]||''),
    reversedQty:reversed.get(String(r[0]))||0,
    netQty:Math.max(0,(Number(r[3])||0)-(reversed.get(String(r[0]))||0)),
    allocatedQty:0,availableQty:0
  }));
  const receiptsById=new Map(receipts.map(r=>[r.id,r]));
  const linkRows=v2Rows_(v2Sheet_(ss,'Purchase Receipt Links'),7);
  const rawPurchases=v2Rows_(v2Sheet_(ss,'Purchasing'),20).filter(r=>String(r[0]||''));
  const purchases=rawPurchases.map(r=>({
    id:String(r[0]),supplier:String(r[1]||''),invoice:String(r[2]||''),invoiceDate:r[3] instanceof Date?Utilities.formatDate(r[3],'Asia/Jakarta','yyyy-MM-dd'):String(r[3]||''),
    itemCode:String(r[4]||''),supplierQty:Number(r[5])||0,supplierUnit:String(r[6]||''),
    stockQty:Number(r[7])||0,stockUnit:String(r[8]||''),unitCost:r[9]===''?'':Number(r[9]),
    invoiceAmount:r[10]===''?'':Number(r[10]),paymentStatus:String(r[12]||''),notes:String(r[13]||''),
    status:String(r[14]||''),updatedAt:String(r[15]||''),requestId:String(r[16]||''),
    revision:Number(r[17])||0,payloadHash:String(r[18]||''),mode:String(r[19]||''),allocations:[]
  }));
  // Legacy demo Purchasing rows used their single Goods Receipt ID before the
  // revisioned link ledger existed. Honor those links without altering history.
  purchases.forEach((p,index)=>{
    if(p.revision){
      p.allocations=linkRows.filter(r=>String(r[1])===p.id&&Number(r[6])===p.revision)
        .map(r=>({receiptId:String(r[2]),qty:Number(r[4])||0}));
    }else{
      const ids=String(rawPurchases[index][11]||'').split(',').map(x=>x.trim()).filter(Boolean);
      let remaining=p.stockQty;
      p.allocations=ids.map(id=>{
        const r=receiptsById.get(id),qty=Math.min(remaining,r?.netQty||0);
        remaining-=qty;
        return {receiptId:id,qty};
      }).filter(a=>a.qty>0);
    }
    p.allocations.forEach(a=>{
      const receipt=receiptsById.get(a.receiptId);
      if(receipt)receipt.allocatedQty+=a.qty;
    });
  });
  receipts.forEach(r=>r.availableQty=Math.max(0,r.netQty-r.allocatedQty));
  purchases.forEach(p=>{
    p.matchedQty=p.allocations.reduce((n,a)=>n+a.qty,0);
    if(!p.status)p.status=p.matchedQty===0?'PENDING MATCHING':p.matchedQty===p.stockQty?'MATCHED':'PARTIALLY MATCHED';
    delete p.payloadHash;
    delete p.requestId;
  });
  return {items,receipts,purchases};
}

function v2SavePurchase_(body){return v2Lock_(function(ss){
  const req=v2ValidRequest_(body.requestId);
  const state=v2OwnerData_(ss);
  const item=state.items.find(i=>v2Code_(i.code)===v2Code_(body.itemCode));
  if(!item)throw Error('Select an active item');
  const supplier=v2SafeText_(body.supplier,120),invoice=v2SafeText_(body.invoice,120);
  if(!supplier||!invoice)throw Error('Supplier and invoice number are required');
  const stockQty=v2PurchaseNumber_(body.stockQty,'stock quantity',false);
  const rawSupplierQty=String(body.supplierQty??'').trim();
  const supplierQty=rawSupplierQty?v2PurchaseNumber_(rawSupplierQty,'supplier quantity',false):stockQty;
  const supplierUnit=v2SafeText_(body.supplierUnit||item.unit,40);
  const date=v2Date_(body.invoiceDate),notes=v2SafeText_(body.notes,300);
  const costBlank=body.unitCost===null||body.unitCost===undefined||String(body.unitCost).trim()==='';
  const unitCost=costBlank?'':v2PurchaseNumber_(body.unitCost,'unit cost',true);
  const amountBlank=body.amountOverride===null||body.amountOverride===undefined||String(body.amountOverride).trim()==='';
  const amount=amountBlank?(costBlank?'':Math.round(supplierQty*unitCost)):v2PurchaseNumber_(body.amountOverride,'invoice amount',true);
  const id=String(body.purchaseId||'');
  const existing=id?state.purchases.find(p=>p.id===id):null;
  if(id&&!existing)throw Error('Purchase not found; refresh and try again');
  const manual=body.manualOverride===true;
  const selectedIds=Array.isArray(body.receiptIds)?body.receiptIds.map(String):[];
  if(selectedIds.length>30||new Set(selectedIds).size!==selectedIds.length)throw Error('Receipt selection is invalid');
  const fingerprint=v2Hash_(JSON.stringify({id,supplier,invoice,date,item:item.code,stockQty,supplierQty,supplierUnit,unitCost,amount,notes,manual,selectedIds}));
  const reqLog=v2Rows_(v2Sheet_(ss,'Purchase Save Requests'),5).find(r=>String(r[0])===req);
  if(reqLog){
    if(String(reqLog[2])!==fingerprint)throw Error('Request ID reused for different purchase details');
    return Object.assign({ok:true,duplicate:true,purchaseId:String(reqLog[1])},v2OwnerData_(ss));
  }
  // A retry can arrive after Purchasing was written but before its request log.
  const alreadySaved=v2Rows_(v2Sheet_(ss,'Purchasing'),20).find(r=>String(r[16])===req);
  if(alreadySaved){
    if(String(alreadySaved[18])!==fingerprint)throw Error('Request ID reused for different purchase details');
    v2Sheet_(ss,'Purchase Save Requests').appendRow([req,String(alreadySaved[0]),fingerprint,new Date(),Number(alreadySaved[17])||1]);
    return Object.assign({ok:true,duplicate:true,purchaseId:String(alreadySaved[0])},v2OwnerData_(ss));
  }
  if(state.purchases.some(p=>p.id!==id&&v2Ref_(p.invoice)===v2Ref_(invoice)&&v2Ref_(p.supplier)===v2Ref_(supplier)&&v2Code_(p.itemCode)===v2Code_(item.code))){
    throw Error('Purchase line already recorded. Edit that entry instead.');
  }
  const candidates=state.receipts.filter(r=>v2Code_(r.itemCode)===v2Code_(item.code)&&
    (manual?selectedIds.includes(r.id):v2Ref_(r.supplierDoc)===v2Ref_(invoice)));
  if(manual&&candidates.length!==selectedIds.length)throw Error('Selected receipt does not belong to the chosen item');
  const ownAmounts=new Map((existing?.allocations||[]).map(a=>[a.receiptId,a.qty]));
  let remaining=stockQty,sourceQty=0;
  const allocations=[];
  candidates.forEach(r=>{
    const available=Math.max(0,r.availableQty+(ownAmounts.get(r.id)||0));
    sourceQty+=available;
    const take=Math.min(remaining,available);
    if(take>0){allocations.push({receiptId:r.id,qty:take});remaining-=take;}
  });
  const matchedQty=stockQty-remaining;
  const status=matchedQty===0?'PENDING MATCHING':matchedQty===stockQty&&sourceQty===stockQty?'MATCHED':'PARTIALLY MATCHED';
  const purchaseId=id||v2Id_('PUR'),revision=(existing?.revision||0)+1;
  const previousLinks=v2Rows_(v2Sheet_(ss,'Purchase Receipt Links'),7)
    .filter(r=>String(r[1])===purchaseId&&Number(r[6])===revision);
  if(previousLinks.some(r=>!allocations.some(a=>a.receiptId===String(r[2])&&a.qty===Number(r[4])))){
    throw Error('An incomplete edit is pending; retry the original save');
  }
  // Append links first. Only the revision stored in Purchasing counts as
  // active; an interrupted append cannot reserve stock or duplicate it.
  allocations.forEach(a=>{
    if(!previousLinks.some(r=>String(r[2])===a.receiptId)){
      v2Sheet_(ss,'Purchase Receipt Links').appendRow([v2Id_('LINK'),purchaseId,a.receiptId,item.code,a.qty,new Date(),revision]);
    }
  });
  const row=[purchaseId,supplier,invoice,date,item.code,supplierQty,supplierUnit,stockQty,item.unit,unitCost,amount,
    allocations.map(a=>a.receiptId).join(','),existing?.paymentStatus||'UNPAID',notes,status,new Date(),req,revision,fingerprint,manual?'MANUAL':'AUTO'];
  const sheet=v2Sheet_(ss,'Purchasing');
  if(existing){
    const rows=v2Rows_(sheet,20),idx=rows.findIndex(r=>String(r[0])===purchaseId);
    if(idx<0)throw Error('Purchase disappeared; refresh and try again');
    sheet.getRange(idx+2,1,1,row.length).setValues([row]);
  }else sheet.appendRow(row);
  v2Sheet_(ss,'Purchase Save Requests').appendRow([req,purchaseId,fingerprint,new Date(),revision]);
  return Object.assign({ok:true,purchaseId,duplicate:false},v2OwnerData_(ss));
})}
