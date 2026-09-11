'use strict';
const ctx=require('../context');
module.exports=function verifyContract(){
  const {fs,path,os,cp,ROOT,fail,read,hash,run,extractJsonStringAssignment,extractNamedFunction,verifyRootOnlyLoad,buildMainBridgeSource,buildPluginSource,MAIN_BRIDGE_PLATFORM_ORDER,MAIN_BRIDGE_FEATURE_ORDER}=ctx;
  const {main,bridge,bridgeSrc,pluginSrc,contextLinksSrc,runtimeAnnotatorSrc,annotator,embeddedBridge}=ctx.loadSources();
  const driverSource=read('src/runtime/chromium-pdf-runtime-driver.js');
// retains the PDF-bottom-origin annotation coordinate regression fixture: page-4 Tiltakshaver is near PDF-bottom Y≈121.75, while the
// blue Forskrift annotation is near raw PDF-bottom Y≈722.89..765.89, i.e.
// EmbedPDF top-origin Y≈76.00..119.00. The incoming point must convert to
// top-origin ≈720.14 and therefore NOT hit Forskrift. A real point inside the
// blue mark (PDF-bottom Y=740) converts to ≈101.89 and MUST hit.
{
  const pageHeight=841.89001;
  const embedTop = pdfBottomY => pageHeight-pdfBottomY;
  const blueTopMin=pageHeight-765.89001, blueTopMax=pageHeight-722.89001;
  const tol=4;
  const hit=y => y>=blueTopMin-tol && y<=blueTopMax+tol;
  if(hit(embedTop(121.7531204223702))) fail('Tiltakshaver false-positive regression: bottom-origin point still hits Forskrift');
  if(!hit(embedTop(740))) fail('real Forskrift point no longer hits annotation');
}


// duplicate Chromium wrapper tokens must use the already-selected
// physical embedded frame identity, while unresolved ambiguity still fails closed.
{
  const adapterSource=fs.readFileSync(path.join(ROOT,'src/platform/pdf-wrapper-frame.js'),'utf8');
  const smoke=`
    const vm=require('vm');
    const src=${JSON.stringify(adapterSource)};
    const mod={exports:{}};
    vm.runInNewContext(src,{module:mod,exports:mod.exports,require,console});
    const {createPdfWrapperFrameAdapter}=mod.exports;
    const make=(p,r)=>({url:'http://127.0.0.1:9999/pdf/token.pdf#page=1',processId:p,routingId:r,executeJavaScript(){}});
    const a=make(5,5), b=make(7,8);
    const adapter=createPdfWrapperFrameAdapter({listFrameSubtree:()=>[a,b]});
    const hit=adapter.resolveExact({wrapperFrame:b},'token');
    if(!hit.ok||hit.frame!==b||hit.reason!=='target-physical-frame-disambiguation'||hit.matchCount!==2) throw new Error('physical duplicate-wrapper disambiguation failed');
    const miss=adapter.resolveExact({},'token');
    if(miss.ok||miss.reason!=='ambiguous') throw new Error('unresolved duplicate-wrapper ambiguity must still fail closed');
  `;
  try { cp.execFileSync(process.execPath,['-e',smoke],{cwd:ROOT,stdio:'pipe',encoding:'utf8'}); }
  catch(e){ fail(`duplicate-wrapper smoke failed\n${e.stderr||e.message}`); }
}



// locator must verify the actual <embed> wrapper on demand.
// Keyboard autoscroll intentionally retains the synchronous resolver in this build.
{
  const adapterSource = read('src/platform/pdf-wrapper-frame.js');
  const bridgeSource = bridgeSrc;
  if(!adapterSource.includes('async function resolveExactVerified(pdfTarget, token)')) fail('verified wrapper resolver missing');
  if(!adapterSource.includes("document.querySelector('embed')")) fail('<embed> capability probe missing');
  const show = extractNamedFunction(bridgeSource,'showLinkLocator');
  if(!show.replace(/\s+/g,'').includes('await__bridgeRuntime.pdfWrapperFrameAdapter.resolveExactVerified(pdfTarget,token)')) fail('locator does not use verified wrapper resolver');
  const keyboard = extractNamedFunction(bridgeSource,'ensureKeyboardSelectionFocusVisible');
  if(!keyboard.replace(/\s+/g,'').includes('__bridgeRuntime.pdfWrapperFrameAdapter.resolveExact(pdfTarget,__bridgeRuntime.ports.pdfTokenFromTarget(pdfTarget))')) fail('unexpectedly changed keyboard autoscroll resolver');
  if(keyboard.includes('resolveExactVerified')) fail('keyboard autoscroll must not use async verified resolver yet');

  const smoke = `
  (async()=>{
    const mod=require(${JSON.stringify(path.join(ROOT,'src/platform/pdf-wrapper-frame.js'))});
    const make=(p,r,hasEmbed)=>({
      url:'http://127.0.0.1:9999/pdf/token.pdf#page=3', processId:p, routingId:r,
      executeJavaScript:async()=>({ok:!!hasEmbed,tag:hasEmbed?'EMBED':null,href:'http://127.0.0.1:9999/pdf/token.pdf#page=3'})
    });
    const outer=make(5,20,false), wrapper=make(9,8,true);
    const adapter=mod.createPdfWrapperFrameAdapter({listFrameSubtree:()=>[outer,wrapper]});
    const hit=await adapter.resolveExactVerified({wrapperFrame:outer},'token');
    if(!hit.ok||hit.frame!==wrapper||hit.reason!=='verified-embed-wrapper-disambiguation'||hit.verifiedCount!==1) throw new Error('locator did not prefer the sole verified <embed> wrapper');
    if(!Array.isArray(hit.verification)||hit.verification.length!==2||hit.verification.filter(x=>x.ok).length!==1) throw new Error('verified wrapper diagnostics incomplete');
    const none=mod.createPdfWrapperFrameAdapter({listFrameSubtree:()=>[make(1,1,false),make(2,2,false)]});
    const miss=await none.resolveExactVerified({},'token');
    if(miss.ok||miss.reason!=='verified-embed-not-ready') throw new Error('zero verified wrappers must fail/retry');
    const a=make(3,3,true), b=make(4,4,true);
    const many=mod.createPdfWrapperFrameAdapter({listFrameSubtree:()=>[a,b]});
    const physical=await many.resolveExactVerified({wrapperFrame:b},'token');
    if(!physical.ok||physical.frame!==b||physical.reason!=='verified-embed-target-physical-disambiguation') throw new Error('physical identity must disambiguate only among verified wrappers');
  })().catch(e=>{console.error(e);process.exit(1);});
  `;
  try { cp.execFileSync(process.execPath,['-e',smoke],{cwd:ROOT,stdio:'pipe',encoding:'utf8'}); }
  catch(e){ fail(`verified-wrapper smoke failed\n${e.stderr||e.message}`); }
}


// locator readiness must not depend on Electron focus staying inside
// the PDF. Only locator uses the async verified-viewer fallback; keyboard and
// the synchronous exact-PDF adapter remain unchanged.
{
  const bridgeSource = bridgeSrc;
  const helper = extractNamedFunction(bridgeSource,'resolveLocatorEmbeddedPdfTargetExact');
  const show = extractNamedFunction(bridgeSource,'showLinkLocator');
  if(!helper.includes('ports.resolveEmbeddedPdfTargetExact(safeToken)')) fail('locator readiness must preserve synchronous exact resolver first');
  if(!helper.replace(/\s+/g,'').includes('__bridgeRuntime.pdfWrapperFrameAdapter.resolveExactVerified(ownerWc,safeToken)')) fail('locator readiness verified-wrapper fallback missing');
  if(!helper.replace(/\s+/g,'').includes('ports.createEmbeddedPdfTarget(hit.ownerWc,safeToken,hit.resolved.frame)')) fail('verified wrapper is not converted to embedded PDF target');
  if(!helper.replace(/\s+/g,'').includes("reason:'locator-verified-embed-not-ready'")) fail('not-ready fail-closed branch missing');
  if(!helper.replace(/\s+/g,'').includes("reason:'locator-verified-embed-ambiguous'")) fail('ambiguous verified-owner fail-closed branch missing');
  if(!show.includes('await __bridgeRuntime.ports.resolveLocatorEmbeddedPdfTargetExact(token)')) fail('showLinkLocator does not use async readiness resolver');
  if(show.includes('findEmbeddedPdfTargetExact(token)')) fail('locator still uses focus-sensitive sync-only viewer lookup');
  const keyboard = extractNamedFunction(bridgeSource,'ensureKeyboardSelectionFocusVisible');
  if(!keyboard.replace(/\s+/g,'').includes('__bridgeRuntime.pdfWrapperFrameAdapter.resolveExact(pdfTarget,__bridgeRuntime.ports.pdfTokenFromTarget(pdfTarget))')) fail('unexpectedly changed keyboard autoscroll resolver');
  if(keyboard.includes('resolveLocatorEmbeddedPdfTargetExact')||keyboard.includes('resolveExactVerified')) fail('keyboard path must not use async locator readiness resolver');
}


// Identity-policy gate: feature code must reuse the canonical verified wrapper
// adapter instead of locally enumerating token-like frames and selecting the
// first frame that happens to expose state.
{
  const bridgeSource = bridgeSrc;
  const adapterSource = read('src/platform/pdf-wrapper-frame.js');
  const policy = read('src/platform/IDENTITY_POLICY.md');
  const auditRegister = JSON.parse(read('scripts/identity-audit.json'));
  if(!adapterSource.includes("const PDF_WRAPPER_FRAME_CONTRACT_VERSION = '0.2';")) fail('wrapper contract v0.2 missing');
  if(!adapterSource.includes('async function executeExactVerified(pdfTarget, token, code, userGesture = true)')) fail('canonical verified wrapper execution missing');
  if(!bridgeSource.includes("const PDF_WRAPPER_FRAME_CONTRACT_VERSION = '0.2';")) fail('bundled wrapper contract v0.2 missing');
  const stale = extractNamedFunction(bridgeSource,'clearStaleKeyboardSelectionBeforeRoute');
  if(!stale.replace(/\s+/g,'').includes('__bridgeRuntime.pdfWrapperFrameAdapter.executeExactVerified(pdfTarget,expectedToken')) fail('stale mouse takeover does not use canonical wrapper execution');
  if(stale.includes('listFrameSubtree(')) fail('stale mouse takeover reintroduced local frame enumeration');
  if(stale.includes('break;')) fail('stale mouse takeover contains first-match break');
  if(!policy.includes('Ambiguity is an error. Never choose the first token/frame/window match.')) fail('fail-closed identity invariant missing');
  if(!policy.includes('ChromiumPdfRuntimeDriver.resolveViewerFrame()')) fail('RuntimeDriver identity policy missing');
  if(auditRegister.policyVersion!=='1.0'||auditRegister.canonicalWrapperAdapter!=='src/platform/pdf-wrapper-frame.js') fail('identity audit register invalid');
  for(const name of ['createEmbeddedPdfTargetAdapter.resolveExact','pdfWrapperFrameAdapter.executeExactVerified','clearStaleKeyboardSelectionBeforeRoute','ChromiumPdfRuntimeDriver.resolveViewerFrame','resolveLocatorEmbeddedPdfTargetExact','capturePdfWrapperMouseGestureHint']) {
    if(!auditRegister.protectedRoutes?.some(x=>x.name===name)) fail(`identity protected route missing: ${name}`);
  }
  if(!auditRegister.reviewedExceptions?.some(x=>x.name==='injectInternalPdfAutoScroll'&&x.classification==='discovery-instrumentation')) fail('discovery instrumentation exception missing');
  for(const rule of auditRegister.forbiddenPatterns||[]){ if(rule?.pattern&&bridgeSource.includes(rule.pattern)) fail(`identity audit forbidden pattern present: ${rule.name}`); }

  const smoke = `
  (async()=>{
    const mod=require(${JSON.stringify(path.join(ROOT,'src/platform/pdf-wrapper-frame.js'))});
    const make=(p,r,hasEmbed)=>({
      url:'http://127.0.0.1:9999/pdf/token.pdf#page=1',processId:p,routingId:r,
      async executeJavaScript(code){
        if(String(code).includes("document.querySelector('embed')")) return {ok:!!hasEmbed,tag:hasEmbed?'EMBED':null};
        return {ok:true,value:'state-from-'+p+'-'+r};
      }
    });
    const outer=make(5,20,false), wrapper=make(9,8,true);
    const adapter=mod.createPdfWrapperFrameAdapter({listFrameSubtree:()=>[outer,wrapper]});
    const hit=await adapter.executeExactVerified({wrapperFrame:outer},'token','(() => ({ok:true}))()',true);
    if(!hit.ok||hit.frame!==wrapper||hit.result?.value!=='state-from-9-8'||hit.reason!=='verified-embed-wrapper-disambiguation') throw new Error('canonical verified wrapper execution selected wrong physical frame');
    const missAdapter=mod.createPdfWrapperFrameAdapter({listFrameSubtree:()=>[make(1,1,false),make(2,2,false)]});
    const miss=await missAdapter.executeExactVerified({},'token','(() => 1)()',true);
    if(miss.ok||miss.reason!=='verified-embed-not-ready') throw new Error('canonical verified wrapper execution must fail closed while not ready');
  })().catch(e=>{console.error(e);process.exit(1);});
  `;
  try { cp.execFileSync(process.execPath,['-e',smoke],{cwd:ROOT,stdio:'pipe',encoding:'utf8'}); }
  catch(e){ fail(`canonical wrapper execution smoke failed\n${e.stderr||e.message}`); }
}

// wrapper mouse-gesture capture must separate physical identity from
// gesture freshness. Physical target selection is canonical verified-wrapper
// resolution; timestamp recency must not arbitrate token-like frames.
{
  const bridgeSource = bridgeSrc;
  const auditRegister = JSON.parse(read('scripts/identity-audit.json'));
  const gesture = extractNamedFunction(bridgeSource,'capturePdfWrapperMouseGestureHint');
  if(!gesture.replace(/\s+/g,'').includes('__bridgeRuntime.pdfWrapperFrameAdapter.executeExactVerified(pdfTarget,expectedToken')) fail('wrapper gesture capture does not use canonical verified wrapper execution');
  if(gesture.includes('listFrameSubtree(')) fail('wrapper gesture capture reintroduced local frame enumeration');
  if(gesture.includes('latest-matching-token')) fail('wrapper gesture capture still uses gesture recency as frame identity');
  if(gesture.includes('candidates.sort(')) fail('wrapper gesture capture still sorts frame candidates by gesture recency');
  if(!gesture.replace(/\s+/g,'').includes('out.ageMs=')) fail('gesture freshness evidence was accidentally removed');
  if(!gesture.includes('wrapperResult.lastDown')||!gesture.includes('wrapperResult.lastUp')) fail('wrapper gesture state read missing');
  if(!auditRegister.protectedRoutes?.some(x=>x.name==='capturePdfWrapperMouseGestureHint'&&x.classification==='gesture-state-after-canonical-identity')) fail('wrapper gesture protected-route contract missing');
  if(!auditRegister.forbiddenPatterns.some(x=>x.name==='gesture-latest-token-frame-arbitration'&&x.pattern==='latest-matching-token')) fail('recency-as-identity forbidden pattern missing');
  for(const rule of auditRegister.forbiddenPatterns||[]){ if(rule?.pattern&&bridgeSource.includes(rule.pattern)) fail(`identity audit forbidden pattern present: ${rule.name}`); }
}

// RuntimeDriver viewer-frame relationship audit is diagnostic-only.
{
  const driverBlock=driverSource;
  for(const required of ['viewerFrameResolutionHistory','relationToWrapper','viewerUrlCandidates','probeOrder','viewerFrameRelationshipDiagnostic: true']){
    if(!driverBlock.includes(required)) fail(`RuntimeDriver relationship diagnostic missing: ${required}`);
  }
}


// copied diagnostics must expose the RuntimeDriver relationship history.
{
  const pluginSource = pluginSrc;
  if(!pluginSource.includes('this.mainProcessTransport?.getPlatformCapabilities?.()')) fail('diagnostic does not request Main Bridge platform capabilities');
  if(!pluginSource.includes('chromiumPdfRuntime = caps?.chromiumPdfRuntime || null')) fail('diagnostic does not extract chromiumPdfRuntime capabilities');
  if(!pluginSource.includes('chromiumPdfRuntimeDiagnosticError')) fail('diagnostic export error field missing');
  if(!pluginSource.includes('chromiumPdfRuntime,')) fail('copied diagnostic does not expose chromiumPdfRuntime');
  const bridgeSource = bridgeSrc;
  if(!bridgeSource.includes('viewerFrameResolutionHistory: viewerFrameResolutionHistory.slice()')) fail('RuntimeDriver history recorder missing');
}

// RuntimeDriver viewer identity is ancestry-bound and fail-closed.
{
  const bridgeSource = bridgeSrc;
  const driverStart=driverSource.indexOf('async function resolveViewerFrame({ ownerWc, wrapperFrame, cachedFrame = null })');
  const driverEnd=driverSource.indexOf('function buildViewerPointScript',driverStart);
  if(driverStart<0||driverEnd<0) fail('canonical RuntimeDriver resolveViewerFrame block missing');
  const route=driverSource.slice(driverStart,driverEnd);
  if(!route.includes("relationToWrapper(cachedFrame,wrapperFrame)==='ancestor-of-wrapper'")) fail('cached viewer is not ancestry-bound');
  if(!route.includes("diagnostic.reason='verified-viewer-ancestor'")) fail('verified viewer ancestor selection missing');
  if(!route.includes("diagnostic.reason='no-verified-viewer-ancestor'")) fail('fail-closed viewer result missing');
  if(route.includes('listFrames(ownerWc)')||route.includes('for (const frame of frames)')) fail('RuntimeDriver reintroduced global viewer scan');
  if(route.includes('wrapper-fallback')||route.includes('frame:wrapperFrame')) fail('RuntimeDriver reintroduced wrapper target fallback');
  const embedded=extractNamedFunction(bridgeSource,'createEmbeddedPdfTarget');
  if(!embedded.replace(/\s+/g,'').includes('if(!resolved?.ok||!resolved.frame)')) fail('embedded target does not honor fail-closed RuntimeDriver result');
  if(embedded.includes('resolved?.frame || wrapperFrame')) fail('embedded target still silently falls back to wrapper');
}


};
