import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
let chromium;
try { ({chromium}=await import('playwright')); }
catch { ({chromium}=await import(`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright/index.mjs`)); }

const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{
  const page=await browser.newPage();
  await page.addInitScript(()=>{
    window.mockCalls=[];
    const seen=new Set();let stock=23;
    let failAfterSavingOnce=true;
    window.google={script:{run:{
      withSuccessHandler(success){return {...this,success}},
      withFailureHandler(failure){return {...this,failure}},
      v2StaffApi(payload){
        window.mockCalls.push(payload);
        queueMicrotask(()=>{
          if(payload.deviceToken!=='test-token')return this.success({ok:false,message:'Device not authorized'});
          if(payload.action==='itemLookup')return this.success(payload.itemCode.toUpperCase()==='TEST-DACRON'?{ok:true,itemCode:'TEST-DACRON',itemName:'Dacron (demo)',unit:'ball',stockAfter:stock}:{ok:false,message:'Not found'});
          const duplicate=seen.has(payload.requestId);
          if(!duplicate){stock+=payload.action==='stockIn'?payload.qty:-payload.qty;seen.add(payload.requestId)}
          if(failAfterSavingOnce){failAfterSavingOnce=false;return this.failure(Error('Simulated transport timeout'))}
          this.success({ok:true,duplicate,stockAfter:stock});
        });
      }
    }}};
  });
  await page.goto(pathToFileURL(resolve('v2-prototype/apps-script/PADOVA_V2_Staff_Staging.html')).href);
  assert.ok(!(await page.locator('body').innerText()).match(/unit cost|purchase price|owner purchasing|harga|\bRp\b/i),'Staff UI must never show purchasing or prices');
  await page.locator('#itemCode').fill('TEST-DACRON');
  await page.locator('#lookup').click();
  assert.match(await page.locator('#status').innerText(),/Aktifkan token/);
  await page.locator('#deviceToken').fill('test-token');
  await page.locator('#applyToken').click();
  await page.locator('#lookup').click();
  await page.locator('#itemCard').waitFor({state:'visible'});
  assert.match(await page.locator('#itemName').innerText(),/Dacron/);
  await page.locator('#staffId').fill('STAFF 1');
  await page.locator('#qty').fill('4');
  await page.locator('#supplierDoc').fill('INV-TEST');
  await page.locator('#stockIn').click();
  await page.locator('#pending').waitFor({state:'visible'});
  assert.match(await page.locator('#status').innerText(),/Simulated transport timeout/);
  const first=await page.evaluate(()=>window.mockCalls.at(-1));
  await page.locator('#retry').click();
  await page.locator('#pending').waitFor({state:'hidden'});
  const second=await page.evaluate(()=>window.mockCalls.at(-1));
  assert.equal(second.requestId,first.requestId,'Retry must not create a new transaction ID');
  assert.match(await page.locator('#status').innerText(),/stok tidak ditambah dua kali/i);
  assert.equal(await page.locator('#itemCode').inputValue(),'');
  assert.equal(await page.locator('#qty').inputValue(),'');
  assert.equal(await page.locator('#supplierDoc').inputValue(),'');
  assert.equal(await page.locator('#staffId').inputValue(),'');
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('padova-v2-staff-staging-pending-v1')),null);
  console.log('PASS: Staging staff UI hides prices, requires authorization, prevents duplicate stock on retry, resets after save');
}finally{await browser.close()}
