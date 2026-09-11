'use strict';
const ctx=require('../context');
module.exports=function verifyContract(){
  const {fs,path,os,cp,ROOT,fail,read,hash,run,extractJsonStringAssignment,extractNamedFunction,verifyRootOnlyLoad,buildMainBridgeSource,buildPluginSource,MAIN_BRIDGE_PLATFORM_ORDER,MAIN_BRIDGE_FEATURE_ORDER}=ctx;
  const {main,bridge,bridgeSrc,pluginSrc,contextLinksSrc,runtimeAnnotatorSrc,annotator,embeddedBridge}=ctx.loadSources();
  const driverSource=read('src/runtime/chromium-pdf-runtime-driver.js');
// Deterministic build: running build again must not alter generated runtime hashes.
const before = [hash(fs.readFileSync(path.join(ROOT,'main.js'))), hash(fs.readFileSync(path.join(ROOT,'main-bridge.js')))];
run([path.join(ROOT,'build.js')]);
const after = [hash(fs.readFileSync(path.join(ROOT,'main.js'))), hash(fs.readFileSync(path.join(ROOT,'main-bridge.js')))];
if(before[0]!==after[0] || before[1]!==after[1]) fail('build is not deterministic');

verifyRootOnlyLoad();


// locator diagnostics must be read-only and cover both coordinate and wrapper scroll spaces.
{
  const bridgeSource = bridgeSrc;
  const compactBridgeSource=bridgeSource.replace(/\s+/g,'');
  for(const marker of [
    'wrapperResolution:null',
    'postConversion:null',
    'pageScreenRect:r?',
    'scrollerScroll:{left:Number(scroller?.scrollLeft||0),top:Number(scroller?.scrollTop||0)}',
    'beforeState=snapshot()',
    'afterState=snapshot()',
    'rec.postConversion=await__bridgeRuntime.ports.pdfPagePointToRemotePoint(pdfTarget,point)'
  ]) if(!compactBridgeSource.includes(marker)) fail(`locator diagnostic marker missing: ${marker}`);
  const show = extractNamedFunction(bridgeSource,'showLinkLocator');
  if(!show.replace(/\s+/g,'').includes('__bridgeRuntime.chromiumPdfRuntimeDriver.scrollWrapperForLocator(wrapper,targetY)')) fail('locator does not delegate canonical wrapper scroll');
  const driver=driverSource;
  if(!driver.includes("window.scrollBy({left:0,top:dy,behavior:'auto'})")) fail('locator scroll primitive changed across RuntimeDriver delegation');
  if(!driver.includes('const desired=Math.max(90,Math.min(h-90,h*0.38));')) fail('locator desired-position policy changed across RuntimeDriver delegation');
}
return {
  mainLines:main.split(/\n/).length,
  bridgeLines:bridge.split(/\n/).length,
  annotatorLines:annotator.split(/\n/).length,
  embeddedBridgeSha256:hash(Buffer.from(embeddedBridge)),
  rootOnlyLoad:true,
  deterministicBuild:true
};

};
