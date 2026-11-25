/**
 * PADOVA V2 — INVENTORY STAGING ONLY
 * Do not replace the existing PADOVA Terminal Apps Script with this file.
 *
 * - Only the dedicated V2 sandbox spreadsheet is allowed.
 * - Staff web endpoint supports physical stock movements only, authenticated by a
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
  'Purchase Save Requests': ['Client Request ID','Purchase ID','Payload Hash','Saved At','Revision'],
  'Sales Orders': ['SO ID','SO No','Status','Customer','Order Date','Notes'],
  'SO Lines': ['SO Line ID','SO ID','Item Code','Ordered Qty','Unit','Notes'],
  'Dispatches': ['Dispatch ID','Client Request ID','Dispatched At','SO ID','SO No','Surat Jalan No','Item Code','Qty','Unit','Recorded By','Status','Evidence URL','Notes']
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
  if(e&&e.parameter&&['dispatch','dispatch-owner'].includes(e.parameter.ui)){
    if(e.parameter.ui==='dispatch-owner')v2AuthorizeOwner_();
    const template=HtmlService.createTemplateFromFile('PADOVA_V2_Dispatch_Staging');
    template.ownerMode=e.parameter.ui==='dispatch-owner';
    return template.evaluate()
      .setTitle('PADOVA V2 — Dispatch Staging');
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
      const stats=v2ItemStats_(ss,item);
      return {ok:true,itemCode:item.itemCode,itemName:item.itemName,itemType:item.itemType,unit:item.unit,stockAfter:stats.stock,todayQty:item.itemType==='FINISHED_GOODS'?stats.todayFinished:stats.todayMaterial};
    }
    if(body.action==='dispatchLookup')return Object.assign({ok:true},v2DispatchLookup_(v2Open_(),body.soNo));
    if(!body.requestId||!body.staffId)throw Error('Request ID and staff ID required');
    if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(String(body.requestId))){
      throw Error('Invalid request ID');
    }
    if(body.action==='dispatchConfirm')return Object.assign({ok:true},v2Dispatch_(body,false));
    const result=body.action==='stockIn'?v2StockIn_(body):body.action==='stockOut'?v2StockOut_(body):null;
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
  const type=v2Code_(item[2]).replace(/[ -]/g,'_');
  const itemType=['FINISHED_GOODS','FINISHED_GOOD','FINISHED_PRODUCT'].includes(type)?'FINISHED_GOODS':
    ['RAW_MATERIAL','RAW_MATERIALS','MATERIAL','PACKAGING'].includes(type)?'RAW_MATERIAL':'';
  if(!itemType)throw Error('Item type must be Raw Material or Finished Goods');
  return {itemCode:String(item[0]),itemName:String(item[1]),itemType,unit:String(item[3]),opening:Number(item[4])||0};
}
function v2Movement_(ss,requestId){return v2Rows_(v2Sheet_(ss,'Stock Movements'),12).find(r=>String(r[1])===String(requestId))}
function v2ItemStats_(ss,item){
  const code=v2Code_(item.itemCode);
  const today=Utilities.formatDate(new Date(),'Asia/Jakarta','yyyy-MM-dd');
  const result={stock:Number(item.opening)||0,todayFinished:0,todayMaterial:0};
  v2Rows_(v2Sheet_(ss,'Stock Movements'),12).forEach(function(r){
    if(v2Code_(r[3])!==code||r[10]!=='POSTED')return;
    const qty=Number(r[6])||0;
    result.stock+=(r[5]==='IN'?1:-1)*qty;
    const date=r[2] instanceof Date?Utilities.formatDate(r[2],'Asia/Jakarta','yyyy-MM-dd'):String(r[2]||'').slice(0,10);
    if(date===today){
      if(r[4]==='PRODUCTION_FINISHED')result.todayFinished+=qty;
      if(r[4]==='PRODUCTION_CORRECTION_OUT')result.todayFinished-=qty;
      if(r[4]==='MATERIAL_ISSUE')result.todayMaterial+=qty;
      if(r[4]==='MATERIAL_ISSUE_CORRECTION_IN')result.todayMaterial-=qty;
    }
  });
  return result;
}
function v2Stock_(ss,item){return v2ItemStats_(ss,item).stock}
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
function v2StockIn_(body){return v2Lock_(function(ss){
  const item=v2FindItem_(ss,body.itemCode),qty=v2Qty_(body.qty),req=String(body.requestId),staff=v2SafeText_(body.staffId,80),doc=v2SafeText_(body.supplierDoc,120);
  if(item.itemType==='FINISHED_GOODS'){
    if(!Number.isInteger(qty))throw Error('Finished goods must be recorded in whole units');
    if(doc)throw Error('Finished production does not use a supplier invoice number');
    const day=Utilities.formatDate(new Date(),'Asia/Jakarta','yyyy-MM-dd');
    const movement=v2AppendMovement_(ss,req,item,'PRODUCTION_FINISHED','IN',qty,'PROD-'+day,staff,'Finished and packed');
    return {movementId:movement.id,duplicate:movement.duplicate,stockAfter:movement.stock,movementType:'PRODUCTION_FINISHED'};
  }
  // A raw-material MASUK without a supplier reference is never a new receipt:
  // it can only correct raw material recorded as used earlier *today*.
  // This keeps receipt stock and production corrections separate, while
  // preserving the staff's familiar MASUK/KELUAR controls.
  if(!doc){
    const prior=v2Movement_(ss,req);
    if(prior){
      if(prior[4]!=='MATERIAL_ISSUE_CORRECTION_IN'||v2Code_(prior[3])!==v2Code_(item.itemCode)||Number(prior[6])!==qty){
        throw Error('Request ID already used for another action');
      }
      return {movementId:String(prior[0]),duplicate:true,stockAfter:v2Stock_(ss,item),movementType:'MATERIAL_ISSUE_CORRECTION_IN'};
    }
    if(qty>v2ItemStats_(ss,item).todayMaterial){
      throw Error('Supplier invoice or sales order reference is required for receipts; material correction exceeds usage recorded today');
    }
    const day=Utilities.formatDate(new Date(),'Asia/Jakarta','yyyy-MM-dd');
    const correction=v2AppendMovement_(ss,req,item,'MATERIAL_ISSUE_CORRECTION_IN','IN',qty,'MATERIAL-'+day,staff,'Same-day material usage correction');
    return {movementId:correction.id,duplicate:correction.duplicate,stockAfter:correction.stock,movementType:'MATERIAL_ISSUE_CORRECTION_IN'};
  }
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
// Retain this internal name for older regression fixtures. The stock-in
// handler decides the movement type from Item Master, never from staff input.
function v2Receive_(body){return v2StockIn_(body)}

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
  if(item.itemType==='FINISHED_GOODS'){
    if(!Number.isInteger(qty))throw Error('Finished goods correction must use whole units');
    if(v2Ref_(body.supplierDoc))throw Error('Finished production correction does not use supplier documents');
    const prior=v2Movement_(ss,req);
    if(prior){
      if(prior[4]!=='PRODUCTION_CORRECTION_OUT'||v2Code_(prior[3])!==v2Code_(item.itemCode)||Number(prior[6])!==qty){
        throw Error('Request ID already used for another action');
      }
      return {movementId:String(prior[0]),duplicate:true,stockAfter:v2Stock_(ss,item)};
    }
    const available=v2ItemStats_(ss,item).todayFinished;
    if(qty>available)throw Error('Production correction exceeds finished goods recorded today');
    const date=Utilities.formatDate(new Date(),'Asia/Jakarta','yyyy-MM-dd');
    const change=v2AppendMovement_(ss,req,item,'PRODUCTION_CORRECTION_OUT','OUT',qty,'PROD-'+date,staff,'Same-day production entry correction');
    return {movementId:change.id,duplicate:change.duplicate,stockAfter:change.stock,movementType:'PRODUCTION_CORRECTION_OUT'};
  }
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
 * Dispatch foundation: physical departures are separate from reservations,
 * preparation, delivery acknowledgement, and sales/invoice recognition.
 * The only physical stock source remains POSTED Stock Movements.
 */
function v2SO_(ss,number){
  const ref=v2Ref_(number);
  if(!ref)throw Error('Masukkan nomor Sales Order');
  const rows=v2Rows_(v2Sheet_(ss,'Sales Orders'),6);
  const matches=rows.filter(r=>v2Ref_(r[1])===ref||v2Ref_(r[0])===ref);
  if(matches.length!==1)throw Error(matches.length?'Nomor SO tidak unik':'Sales Order tidak ditemukan');
  const r=matches[0];
  return {id:String(r[0]),no:String(r[1]),status:v2Ref_(r[2]),customer:String(r[3]||'')};
}
function v2DispatchRows_(ss){return v2Rows_(v2Sheet_(ss,'Dispatches'),13)}
function v2DispatchMovements_(ss){return v2Rows_(v2Sheet_(ss,'Stock Movements'),12).filter(r=>r[10]==='POSTED'&&['DISPATCH_OUT','DISPATCH_CORRECTION_IN'].includes(r[4]))}
function v2DispatchNet_(id,movements){
  return movements.filter(r=>String(r[8])===String(id)).reduce((qty,r)=>qty+(r[4]==='DISPATCH_OUT'?Number(r[6]||0):-Number(r[6]||0)),0);
}
function v2AllDispatchStats_(ss){
  const moves=v2DispatchMovements_(ss);
  const dispatches=v2DispatchRows_(ss).map(function(r){
    const posted=moves.some(m=>m[4]==='DISPATCH_OUT'&&String(m[8])===String(r[0]));
    const net=posted?v2DispatchNet_(r[0],moves):0;
    return {id:String(r[0]),requestId:String(r[1]),date:r[2],soId:String(r[3]),soNo:String(r[4]),sjNo:String(r[5]),itemCode:String(r[6]),qty:Number(r[7])||0,unit:String(r[8]),staff:String(r[9]),evidenceUrl:String(r[11]||''),posted,net};
  });
  return {dispatches,moves};
}
function v2Reservations_(ss,all){
  const orders=v2Rows_(v2Sheet_(ss,'Sales Orders'),6).filter(r=>v2Ref_(r[2])==='CONFIRMED');
  const lines=v2Rows_(v2Sheet_(ss,'SO Lines'),6);
  const total=new Map(),bySO=new Map();
  orders.forEach(function(so){
    lines.filter(line=>String(line[1])===String(so[0])).forEach(function(line){
      const code=v2Code_(line[2]);
      const shipped=all.dispatches.filter(d=>d.soId===String(so[0])&&v2Code_(d.itemCode)===code).reduce((n,d)=>n+d.net,0);
      const remain=Math.max(0,Number(line[3]||0)-shipped);
      total.set(code,(total.get(code)||0)+remain);
      const key=String(so[0])+'|'+code;
      bySO.set(key,(bySO.get(key)||0)+remain);
    });
  });
  return {total,bySO};
}
function v2DispatchLookup_(ss,soNo){
  const so=v2SO_(ss,soNo),all=v2AllDispatchStats_(ss),reservation=v2Reservations_(ss,all);
  const lines=v2Rows_(v2Sheet_(ss,'SO Lines'),6).filter(r=>String(r[1])===so.id);
  if(!lines.length)throw Error('Sales Order belum memiliki baris barang');
  const seen=new Set();
  const items=lines.map(function(r){
    const item=v2FindItem_(ss,r[2]);
    if(item.itemType!=='FINISHED_GOODS')throw Error('SO dispatch only supports Finished Goods');
    if(seen.has(v2Code_(item.itemCode)))throw Error('Duplicate item in SO lines; owner must consolidate before dispatch');
    seen.add(v2Code_(item.itemCode));
    const ordered=Number(r[3]);
    if(!Number.isInteger(ordered)||ordered<=0||v2Ref_(r[4])!==v2Ref_(item.unit))throw Error('Invalid SO quantity or operational unit');
    const shipped=all.dispatches.filter(d=>d.soId===so.id&&v2Code_(d.itemCode)===v2Code_(item.itemCode)).reduce((n,d)=>n+d.net,0);
    const remaining=ordered-shipped;
    if(remaining<0)throw Error('Dispatch exceeds SO; owner must review');
    const onHand=v2Stock_(ss,item);
    const reserved=reservation.total.get(v2Code_(item.itemCode))||0;
    const thisSO=reservation.bySO.get(so.id+'|'+v2Code_(item.itemCode))||0;
    return {itemCode:item.itemCode,itemName:item.itemName,unit:item.unit,ordered,shipped,remaining,onHand,reserved,available:onHand-reserved,dispatchable:Math.max(0,Math.min(remaining,onHand-(reserved-thisSO)))};
  });
  return {so,items};
}
function v2DispatchId_(requestId){return 'DSP-'+requestId}
function v2Dispatch_(body,owner){return v2Lock_(function(ss){
  const req=String(body.requestId||''),staff=v2SafeText_(body.staffId,80),qty=v2Qty_(body.qty);
  if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(req)||!staff)throw Error('Request ID and staff ID required');
  if(!Number.isInteger(qty))throw Error('Dispatch quantity must be a whole unit');
  const sj=v2SafeText_(body.sjNo,100),code=v2Code_(body.itemCode),evidence=v2SafeText_(body.evidenceUrl,500);
  if(!sj)throw Error('Nomor Surat Jalan wajib diisi');
  if(evidence&&!/^https:\/\/(drive|docs)\.google\.com\//i.test(evidence))throw Error('Evidence must be a Google Drive link');
  if(!owner&&body.overrideReservation)throw Error('Only owner may override reservations');
  const summary=v2DispatchLookup_(ss,body.soNo),so=summary.so;
  if(so.status!=='CONFIRMED')throw Error('Only CONFIRMED Sales Orders may dispatch');
  const line=summary.items.find(x=>v2Code_(x.itemCode)===code);
  if(!line)throw Error('Item does not belong to this Sales Order');
  const existing=v2DispatchRows_(ss).find(r=>String(r[1])===req);
  if(existing){
    if(String(existing[3])!==so.id||v2Code_(existing[6])!==code||Number(existing[7])!==qty||v2Ref_(existing[5])!==v2Ref_(sj)||String(existing[11]||'')!==evidence){
      throw Error('Request ID reused for a different dispatch');
    }
    const movement=v2AppendMovement_(ss,req,v2FindItem_(ss,code),'DISPATCH_OUT','OUT',qty,String(existing[0]),staff,'Physical departure - SJ '+sj);
    return {dispatchId:String(existing[0]),movementId:movement.id,duplicate:movement.duplicate,stockAfter:movement.stock,soRemaining:line.remaining-(movement.duplicate?0:qty)};
  }
  if(qty>line.remaining)throw Error('Quantity exceeds undelivered Sales Order balance');
  if(qty>line.onHand)throw Error('Insufficient physically available finished stock');
  if(!owner&&!body.overrideReservation&&qty>line.dispatchable)throw Error('Stock reserved for another SO; ask owner to review');
  if(!body.overrideReservation&&owner&&qty>line.dispatchable)throw Error('Tick owner reservation override to dispatch from another SO reservation');
  const otherSJ=v2DispatchRows_(ss).filter(r=>v2Ref_(r[5])===v2Ref_(sj));
  if(otherSJ.some(r=>String(r[3])!==so.id))throw Error('Surat Jalan number already belongs to another Sales Order');
  if(otherSJ.some(r=>v2Code_(r[6])===code))throw Error('This item is already recorded on the same Surat Jalan');
  const id=v2DispatchId_(req),item=v2FindItem_(ss,code);
  v2Sheet_(ss,'Dispatches').appendRow([id,req,new Date(),so.id,so.no,sj,item.itemCode,qty,item.unit,staff,'DISPATCHED',evidence,v2SafeText_(body.notes,200)]);
  const movement=v2AppendMovement_(ss,req,item,'DISPATCH_OUT','OUT',qty,id,staff,'Physical departure - SJ '+sj);
  return {dispatchId:id,movementId:movement.id,duplicate:movement.duplicate,stockAfter:movement.stock,soRemaining:line.remaining-qty};
})}
function v2CorrectDispatch_(body){return v2Lock_(function(ss){
  const req=String(body.requestId||''),id=String(body.dispatchId||''),qty=v2Qty_(body.qty),reason=v2SafeText_(body.reason,200),staff=v2SafeText_(body.staffId,80);
  if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(req)||!staff||!reason)throw Error('Request ID, owner ID and correction reason are required');
  if(!Number.isInteger(qty))throw Error('Correction quantity must be a whole unit');
  const dispatch=v2AllDispatchStats_(ss).dispatches.find(d=>d.id===id);
  if(!dispatch||!dispatch.posted)throw Error('Posted dispatch not found');
  const previous=v2Movement_(ss,req);
  if(previous){
    if(previous[4]!=='DISPATCH_CORRECTION_IN'||String(previous[8])!==id||Number(previous[6])!==qty)throw Error('Request ID already used');
    return {duplicate:true,stockAfter:v2Stock_(ss,v2FindItem_(ss,dispatch.itemCode)),dispatchRemaining:dispatch.net};
  }
  if(qty>dispatch.net)throw Error('Correction exceeds the net dispatched quantity');
  const item=v2FindItem_(ss,dispatch.itemCode);
  const movement=v2AppendMovement_(ss,req,item,'DISPATCH_CORRECTION_IN','IN',qty,id,staff,'Owner correction - SJ '+dispatch.sjNo+': '+reason);
  return {movementId:movement.id,duplicate:movement.duplicate,stockAfter:movement.stock,dispatchRemaining:dispatch.net-qty};
})}
function v2DispatchSnapshot_(ss){
  const all=v2AllDispatchStats_(ss),reservation=v2Reservations_(ss,all);
  const availability=v2Rows_(v2Sheet_(ss,'Item Master'),7).filter(r=>v2Ref_(r[5])==='YES').map(r=>{
    const item=v2FindItem_(ss,r[0]);
    if(item.itemType!=='FINISHED_GOODS')return null;
    const onHand=v2Stock_(ss,item),reserved=reservation.total.get(v2Code_(item.itemCode))||0;
    return {itemCode:item.itemCode,itemName:item.itemName,unit:item.unit,onHand,reserved,available:onHand-reserved};
  }).filter(Boolean);
  const dispatches=all.dispatches.filter(d=>d.posted).map(d=>({id:d.id,soNo:d.soNo,sjNo:d.sjNo,itemCode:d.itemCode,qty:d.qty,corrected:d.qty-d.net,net:d.net,unit:d.unit,staff:d.staff,evidenceUrl:d.evidenceUrl,date:d.date instanceof Date?Utilities.formatDate(d.date,'Asia/Jakarta','yyyy-MM-dd HH:mm'):String(d.date)})).reverse();
  return {availability,dispatches};
}

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
    if(body.action==='dispatchLookup')return Object.assign({ok:true},v2DispatchLookup_(v2Open_(),body.soNo));
    if(body.action==='dispatchSnapshot')return Object.assign({ok:true},v2DispatchSnapshot_(v2Open_()));
    if(body.action==='dispatchConfirm')return Object.assign({ok:true},v2Dispatch_(body,true));
    if(body.action==='dispatchCorrect')return Object.assign({ok:true},v2CorrectDispatch_(body));
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
