/**
 * PADOVA V2 — INVENTORY STAGING ONLY
 * Do not replace the existing PADOVA Terminal Apps Script with this file.
 *
 * - Only the dedicated V2 sandbox spreadsheet is allowed.
 * - Public web endpoint supports staff stock movements only, authenticated by a
 *   private device token. It never returns or accepts prices/payments.
 * - Owner purchasing is intentionally NOT exposed as a web API yet.
 * - All changes use immutable event rows + stable clientRequestId.
 * - No source of stock other than POSTED Stock Movements.
 */
const V2_STAGING_SPREADSHEET_ID = '1nVvEU51gktNpt8T4XDaokqw33O-yVgbyEWx4D62OBuI';
const V2_OWNER_EMAIL = 'padovaindonesia@gmail.com';
const V2_HEADER = {
  'Goods Receipts': ['Receipt ID','Received Date','Item Code','Qty Received','Unit','Supplier','Supplier Doc Ref','Recorded By','Status','Linked Purchase ID','Notes','Client Request ID'],
  'Receipt Reversals': ['Reversal ID','Date','Receipt ID','Item Code','Qty','Supplier Doc Ref','Staff ID','Client Request ID'],
  'Stock Movements': ['Movement ID','Request ID','Movement Date','Item Code','Movement Type','Direction','Qty','Unit','Source Ref','Recorded By','Status','Reason'],
  'Purchase Receipt Links': ['Link ID','Purchase ID','Receipt ID','Item Code','Matched Qty','Linked At']
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
  // /dev?ui=staff is a private, editor-only test deployment until the security
  // review and staff provisioning are completed. No owner purchasing in HTML.
  if(e&&e.parameter&&e.parameter.ui==='staff'){
    return HtmlService.createHtmlOutputFromFile('PADOVA_V2_Staff_Staging')
      .setTitle('PADOVA V2 — Staff Staging');
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
function v2AllocatedQty_(ss,receiptId){return v2Rows_(v2Sheet_(ss,'Purchase Receipt Links'),6).filter(r=>String(r[2])===String(receiptId)).reduce((n,r)=>n+Number(r[4]||0),0)}
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
  const lines=v2Rows_(v2Sheet_(ss,'Goods Receipts'),12).filter(r=>v2Code_(r[2])===v2Code_(item.itemCode)&&v2Ref_(r[6])===reference).reverse();
  const allocation=[];
  for(const r of lines){
    const available=Number(r[3])-v2ReversedQty_(ss,r[0])-v2AllocatedQty_(ss,r[0]);
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
