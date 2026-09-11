'use strict';
const ctx=require('../context');
module.exports=function verifyContract(){
  const {fs,path,os,cp,ROOT,fail,read,hash,run,extractJsonStringAssignment,extractNamedFunction,verifyRootOnlyLoad,buildMainBridgeSource,buildPluginSource,MAIN_BRIDGE_PLATFORM_ORDER,MAIN_BRIDGE_FEATURE_ORDER}=ctx;
  const {main,bridge,bridgeSrc,pluginSrc,contextLinksSrc,runtimeAnnotatorSrc,annotator,embeddedBridge}=ctx.loadSources();
  const driverSource=read('src/runtime/chromium-pdf-runtime-driver.js');
// retain page-point conversion authority is exclusively RuntimeDriver-owned.
if(!driverSource.includes("const CHROMIUM_PDF_RUNTIME_DRIVER_CONTRACT_VERSION = '0.1'")) fail('ChromiumPdfRuntimeDriver contract missing');
if(!read('src/main-bridge/composition.js').includes('this.chromiumPdfRuntimeDriver = createChromiumPdfRuntimeDriver();')) fail('ChromiumPdfRuntimeDriver composition missing');
if(!extractNamedFunction(read('src/main-bridge/features/01-kernel.js'),'isEmbeddedPdfTarget')) fail('embedded PDF target classification missing');
if(bridge.includes('function isPdfWebContents')) fail('legacy PDF WebContents classifier returned');
if(!read('src/main-bridge/features/01-kernel.js').includes('return __bridgeRuntime.chromiumPdfRuntimeDriver.isPdfContext(params);')) fail('main-process PDF context classification bypasses ChromiumPdfRuntimeDriver');
if(!read('src/main-bridge/features/01-kernel.js').includes('await __bridgeRuntime.chromiumPdfRuntimeDriver.resolveViewerFrame({')) fail('embedded viewer-frame resolution bypasses ChromiumPdfRuntimeDriver');
if(!read('src/main-bridge/features/08-lifecycle.js').includes('chromiumPdfRuntime: __bridgeRuntime.chromiumPdfRuntimeDriver.getCapabilities()')) fail('ChromiumPdfRuntimeDriver diagnostics missing');
if(!driverSource.includes('viewerPointCapture: true')) fail('ChromiumPdfRuntimeDriver viewer-point capability missing');
if(!driverSource.includes('captureViewerPoint,')) fail('ChromiumPdfRuntimeDriver viewer-point method is not exported');
if(!read('src/main-bridge/features/03-context-menu.js').includes('return __bridgeRuntime.chromiumPdfRuntimeDriver.captureViewerPoint(target, x, y);')) fail('capturePdfViewerPoint does not delegate to ChromiumPdfRuntimeDriver');
if((driverSource.match(/function buildViewerPointScript\(/g)||[]).length!==1) fail('viewer-point script builder must have exactly one owner');
if((bridge.match(/function buildViewerPointScript\(/g)||[]).length!==1) fail('generated Main Bridge must bundle RuntimeDriver exactly once');
if(!bridge.includes("const VERSION = '0.1.194';")) fail('Main Bridge version is stale');
if(!driverSource.includes('pagePointToRemoteProduction: true')) fail('RuntimeDriver page-point production capability missing');
if(bridge.includes('lastPagePointDriverShadow')||bridge.includes('pagePointDriverShadowSeq')) fail('mixed legacy/shadow page-point authority remains');
const pagePointBlock=extractNamedFunction(read('src/main-bridge/features/05-selection-operations.js'),'pdfPagePointToRemotePoint');
if(!pagePointBlock) fail('page-point conversion boundary missing');
if(!pagePointBlock.includes('return __bridgeRuntime.chromiumPdfRuntimeDriver.pagePointToRemote(target, hint);')) fail('page-point production delegation missing');
if(pagePointBlock.includes('target.executeJavaScript(`(() => {')) fail('legacy inline page-point conversion still active');

// Chromium viewer DOM/viewport + one-shot wrapper scroll primitives
// have one owner. Feature code outside the RuntimeDriver must not know these APIs.
if(!driverSource.includes('viewerDomBoundaryProduction: true')) fail('RuntimeDriver viewer DOM production capability missing');
for(const cap of ['scrollerGeometryCapture: true','keyboardStateCapture: true','keyboardOverlayRendering: true','locatorOverlayRendering: true','wrapperScrollOperations: true']){
  if(!driverSource.includes(cap)) fail(`RuntimeDriver capability missing: ${cap}`);
}
{
  const runtimeStartMarker='// BEGIN GENERATED MAIN-BRIDGE RUNTIME CONTRACTS';
  const runtimeEndMarker='// END GENERATED MAIN-BRIDGE RUNTIME CONTRACTS';
  const runtimeStart=bridge.indexOf(runtimeStartMarker);
  const runtimeEnd=bridge.indexOf(runtimeEndMarker,runtimeStart);
  if(runtimeStart<0||runtimeEnd<0) fail('generated RuntimeDriver bundle boundary missing');
  const outside=bridge.slice(0,runtimeStart)+bridge.slice(runtimeEnd+runtimeEndMarker.length);
  for(const forbidden of ["document.querySelector('pdf-viewer')",'viewer.viewport','getPageScreenRect(','getPageInsetDimensions(','convertPageToScreen(',"querySelector('#scroller')"]){
    if(outside.includes(forbidden)) fail(`Chromium viewer primitive escaped RuntimeDriver: ${forbidden}`);
  }
}
const compactBridge=bridge.replace(/\s+/g,'');
for(const delegation of [
  '__bridgeRuntime.chromiumPdfRuntimeDriver.captureScrollerOffset(target)',
  '__bridgeRuntime.chromiumPdfRuntimeDriver.captureKeyboardState(target,includeViewportMap)',
  '__bridgeRuntime.chromiumPdfRuntimeDriver.renderKeyboardSelectionOverlay(pdfTarget.runtimeFrame,clean)',
  '__bridgeRuntime.chromiumPdfRuntimeDriver.removeKeyboardSelectionOverlay(pdfTarget.runtimeFrame)',
  '__bridgeRuntime.chromiumPdfRuntimeDriver.scrollWrapperForKeyboard(wrapper,targetY,direction)',
  '__bridgeRuntime.chromiumPdfRuntimeDriver.scrollWrapperForLocator(wrapper,targetY)',
  '__bridgeRuntime.chromiumPdfRuntimeDriver.renderLinkLocatorOverlay(pdfTarget.runtimeFrame,point)'
]){ if(!compactBridge.includes(delegation.replace(/\s+/g,''))) fail(`RuntimeDriver delegation missing: ${delegation}`); }
const runtimePolicy=read('src/platform/RUNTIME_DRIVER_POLICY.md');
if(!runtimePolicy.includes('Main Bridge feature code must not directly depend on its viewer DOM/viewport implementation')) fail('RuntimeDriver policy missing canonical boundary');

const chromiumOrigin='chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/';
if((driverSource.split(chromiumOrigin).length-1)!==1) fail('Chromium PDF viewer origin must have one canonical declaration');
if((bridge.split(chromiumOrigin).length-1)!==1) fail('generated Main Bridge must bundle Chromium viewer origin exactly once');
{
  const driverModulePath=path.join(ROOT,'src/runtime/chromium-pdf-runtime-driver.js');
  const smoke = `const {createChromiumPdfRuntimeDriver}=require(${JSON.stringify(driverModulePath)});
const chromiumPdfRuntimeDriver=createChromiumPdfRuntimeDriver();
(async()=>{
  const driver=chromiumPdfRuntimeDriver;
  const origin=${JSON.stringify('chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/')};
  if(!driver||driver.contractVersion!=='0.1') throw new Error('driver smoke load failed');
  if(!driver.isViewerUrl(origin+'index.html')) throw new Error('viewer origin classification failed');
  if(driver.isViewerUrl('https://example.com/test.pdf')) throw new Error('non-viewer URL classified as viewer');
  if(!driver.isPdfContext({frameURL:'http://127.0.0.1:1234/pdf/abc.pdf'})) throw new Error('wrapper PDF context classification failed');

  const calls=[];
  let nextRouting=1;
  const frame=(name,url,hit,parent=null)=>({name,url,parent,processId:7,routingId:nextRouting++,isMainFrame:false,isDestroyed(){return false;},async executeJavaScript(){calls.push(name);return !!hit;}});
  const root=frame('root','app://obsidian.md/index.html',false,null);
  const unrelatedViewer=frame('unrelated-viewer',origin+'index.html',true,root);
  const host=frame('host','https://obsidian.local/pdf-host',false,root);
  const viewer=frame('viewer',origin+'index.html',true,host);
  const wrapper=frame('wrapper','http://127.0.0.1:1234/pdf/abc.pdf',false,viewer);

  const result=await driver.resolveViewerFrame({ownerWc:{id:1,getType(){return 'window';}},wrapperFrame:wrapper,listFrames:()=>[unrelatedViewer,viewer,wrapper]});
  if(result?.frame!==viewer||result?.reason!=='verified-viewer-ancestor') throw new Error('ancestry-bound viewer resolution failed');
  if(calls.join(',')!=='viewer') throw new Error('RuntimeDriver probed outside viewer ancestry: '+calls.join(','));

  calls.length=0;
  const cachedWrong=await driver.resolveViewerFrame({ownerWc:{id:1,getType(){return 'window';}},wrapperFrame:wrapper,cachedFrame:unrelatedViewer,listFrames:()=>[unrelatedViewer]});
  if(cachedWrong?.frame!==viewer||cachedWrong?.reason!=='verified-viewer-ancestor') throw new Error('unrelated cached viewer was not rejected');
  if(calls.join(',')!=='viewer') throw new Error('cache rejection did not re-resolve ancestry: '+calls.join(','));

  calls.length=0;
  const cachedOk=await driver.resolveViewerFrame({ownerWc:{id:1,getType(){return 'window';}},wrapperFrame:wrapper,cachedFrame:viewer});
  if(cachedOk?.frame!==viewer||cachedOk?.reason!=='cached-verified-viewer-ancestor'||calls.length!==0) throw new Error('ancestry-bound viewer cache failed');

  const orphanRoot=frame('orphan-root','app://obsidian.md/index.html',false,null);
  const orphanWrapper=frame('orphan-wrapper','http://127.0.0.1:1234/pdf/def.pdf',false,orphanRoot);
  calls.length=0;
  const missing=await driver.resolveViewerFrame({ownerWc:{id:1,getType(){return 'window';}},wrapperFrame:orphanWrapper,listFrames:()=>[unrelatedViewer]});
  if(missing?.ok!==false||missing?.frame!==null||missing?.reason!=='no-verified-viewer-ancestor') throw new Error('missing viewer ancestor did not fail closed');
  if(calls.length!==0) throw new Error('fail-closed route probed unrelated frames: '+calls.join(','));

  let captureScript='';
  const captureTarget={async executeJavaScript(code){captureScript=String(code||'');return {ok:true,candidates:[{pageIndex:0,pageX:12,pageY:34,coordinateSpace:'pdf-bottom-origin'}]};}};
  const captured=await driver.captureViewerPoint(captureTarget,25,40);
  if(!captured?.ok||captured?.candidates?.[0]?.coordinateSpace!=='pdf-bottom-origin') throw new Error('viewer-point capture contract failed');
  if(!captureScript.includes("document.querySelector('pdf-viewer')")||!captureScript.includes('convertPageToScreen')) throw new Error('viewer-point runtime script not owned by driver');
  const caps=driver.getCapabilities();
  if(caps?.viewerPointCapture!==true) throw new Error('viewer-point capability fingerprint missing');
  if(caps?.viewerDomBoundaryProduction!==true||caps?.scrollerGeometryCapture!==true||caps?.keyboardStateCapture!==true||caps?.keyboardOverlayRendering!==true||caps?.locatorOverlayRendering!==true||caps?.wrapperScrollOperations!==true) throw new Error('viewer-DOM capability fingerprint missing');
  for(const name of ['captureScrollerOffset','captureKeyboardState','renderKeyboardSelectionOverlay','removeKeyboardSelectionOverlay','renderLinkLocatorOverlay','scrollWrapperForKeyboard','scrollWrapperForLocator']) if(typeof driver[name]!=='function') throw new Error('viewer-DOM driver method missing: '+name);
  if(caps?.viewerFrameRelationshipDiagnostic!==true) throw new Error('viewer-frame relationship diagnostic capability missing');
  if(!Array.isArray(caps?.viewerFrameResolutionHistory)||caps.viewerFrameResolutionHistory.length<4) throw new Error('viewer-frame resolution history missing');
  const first=caps.viewerFrameResolutionHistory[0];
  const viewerCandidate=first?.viewerUrlCandidates?.find(x=>x.url===origin+'index.html');
  if(viewerCandidate?.relationToWrapper!=='ancestor-of-wrapper') throw new Error('viewer-wrapper ancestry diagnostic failed');
  if(first?.selected?.routingId!==viewer.routingId) throw new Error('viewer-frame diagnostic selected wrong physical frame');
  const rejected=caps.viewerFrameResolutionHistory.find(x=>x.cachedRejectedReason==='not-wrapper-ancestor');
  if(!rejected) throw new Error('unrelated cache rejection diagnostic missing');
  const failed=caps.viewerFrameResolutionHistory.find(x=>x.reason==='no-verified-viewer-ancestor');
  if(!failed||failed.selected!==null) throw new Error('fail-closed viewer diagnostic missing');
})().catch(e=>{console.error(e&&e.stack||e);process.exit(1);});`;
  try { cp.execFileSync(process.execPath,['-e',smoke],{cwd:ROOT,stdio:'pipe',encoding:'utf8'}); }
  catch(e){ fail(`ChromiumPdfRuntimeDriver smoke failed\n${e.stderr||e.message}`); }
}

{
  const nativeCopy=extractNamedFunction(read('src/main-bridge/features/05-selection-operations.js'),'routeNativeMouseCopyFromPdf');
  if(!nativeCopy) fail('native mouse Ctrl+C function boundary missing');
  if(!nativeCopy.includes('ports.capturePdfMouseGestureHint(pdfTarget)')||!nativeCopy.replace(/\s+/g,'').includes('ports.captureSelectedTextFromPdf(pdfTarget,ownerWc)')) fail('native mouse Ctrl+C text+gesture contract missing');
  if(nativeCopy.includes('rec.geometryOnly=true')) fail('unsafe geometry-only native Ctrl+C path still present');
  if(!nativeCopy.replace(/\s+/g,'').includes("selectionSource:'native-pdf-copy'")) fail('embedded native Ctrl+C event contract missing');
}
if(!compactBridge.includes("if(Date.now()<__bridgeRuntime.runtime.keyboard.syntheticCtrlCUntil)")) fail('synthetic Ctrl+C recursion guard missing from embedded input path');
if(!bridge.includes('instrumentationVersion:1')) fail('wrapper instrumentation contract version missing');
if(!bridge.includes('verified-embed-target-physical-disambiguation')) fail('canonical exact physical wrapper-frame routing missing');
if(!annotator.includes('cross-page-mouse-gesture-validated')) fail('validated cross-page mouse range contract missing');
if(!bridge.includes("coordinateSpace:'pdf-bottom-origin'")) fail('Main Bridge PDF bottom-origin coordinate contract missing');
if(annotator.includes("mode:'flipped-y'")) fail('unsafe mirrored point-highlight Y probe still present');
const compactAnnotator=annotator.replace(/\s+/g,'');
if(!compactAnnotator.includes("gestureCoordinateSpace==='pdf-bottom-origin'")) fail('native mouse gesture top-origin boundary conversion missing');
if(!compactAnnotator.includes("mode:'embedpdf-top-origin-from-pdf-bottom-origin'")) fail('direct annotation hit-test coordinate conversion missing');
if(!compactAnnotator.includes("annotationCoordinateSpace:'embedpdf-top-origin'")) fail('annotation coordinate diagnostics missing');
if(annotator.includes('highlightDiagnostics')) fail('temporary point-highlight rect diagnostics still present');
if(main.includes('lastPointHighlightInspection')) fail('temporary lastPointHighlightInspection export still present');
if(main.includes('pointDiagnosticSummary')) fail('temporary per-menu pointDiagnosticSummary still present');


};
