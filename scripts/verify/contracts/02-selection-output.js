'use strict';
const ctx=require('../context');
module.exports=function verifyContract(){
  const {fs,path,os,cp,ROOT,fail,read,hash,run,extractJsonStringAssignment,extractNamedFunction,verifyRootOnlyLoad,buildMainBridgeSource,buildPluginSource,MAIN_BRIDGE_PLATFORM_ORDER,MAIN_BRIDGE_FEATURE_ORDER}=ctx;
  const {main,bridge,bridgeSrc,pluginSrc,contextLinksSrc,runtimeAnnotatorSrc,annotator,embeddedBridge}=ctx.loadSources();
  const annotatorCompact=annotator.replace(/\s+/g,'');
if(bridge !== bridgeSrc) fail('generated root main-bridge.js differs from canonical source-bundle output');
if(embeddedBridge !== bridge) fail('embedded Main Bridge differs byte-for-byte from root main-bridge.js');

// Standalone annotator is no longer embedded as a JS template literal. Template-level
// double escaping is therefore a semantic bug even though node --check still passes.
for (const forbidden of ['/\\\\s', '/\\\\d', '[\\\\p{', '-p\\\\d']) {
  if (annotator.includes(forbidden)) fail(`standalone annotator contains template-escaped regex artifact: ${forbidden}`);
}
for (const required of ["replace(/\\s+/g, ' ')", '/\\s/.test(ch)', '/\\d/u.test(ch)', '[\\p{L}\\p{N}\\p{M}_]', '-p\\d+$/i']) {
  if (!annotator.includes(required)) fail(`standalone annotator regex semantic guard missing: ${required}`);
}
if(!main.includes(JSON.stringify(annotator))) fail('generated main.js does not contain exact annotator source');
const moduleMatch = annotator.match(/<script type="module">([\s\S]*?)<\/script>/);
if(!moduleMatch) fail('annotator module script not found');
const tmpMjs = path.join(os.tmpdir(), `pdfium-gate-annotator-${process.pid}.mjs`);
fs.writeFileSync(tmpMjs,moduleMatch[1]);
try { cp.execFileSync(process.execPath,['--check',tmpMjs],{stdio:'pipe'}); }
finally { fs.rmSync(tmpMjs,{force:true}); }


// retains the same-page duplicate-text coordinate and diagnostics contract.
if(!annotatorCompact.includes("chosen.rangeSource='text-search-gesture-geometry'")) fail('same-page duplicate-text gesture geometry resolution missing');
if(!annotatorCompact.includes("diagnosticVersion:'0.1.194'")) fail('diagnostic payload version missing');
if(!annotator.includes("saved-pdf-highlight-geometry")) fail('persisted Highlight geometry diagnostic missing');
if(!main.includes('lastNativeSelectionIdentityDiagnostic')) fail('renderer identity diagnostic export missing');
{
  const start=annotator.indexOf('const occurrenceGestureGeometry = async');
  const end=annotator.indexOf('if (occurrences.length > 1 && gestureTopPoints.length)', start);
  if(start<0 || end<0) fail('occurrence geometry resolver block missing');
  const occurrenceBlock=annotator.slice(start,end);
  if(!occurrenceBlock.replace(/\s+/g,'').includes('topRects.push({pageIndex,left:x,right:x+width,top:y,bottom:y+height});')) fail('top-origin glyph rect scoring contract missing');
  if(occurrenceBlock.includes('top:pageHeight-(y+height)')) fail('occurrence scorer still double-mirrors glyph Y');
}
{
  const start=annotator.indexOf('const glyphRecordAt = async', Math.max(0,annotator.indexOf('const occurrenceGestureGeometry')-5000));
  const end=annotator.indexOf('const scorePoint =', start);
  if(start<0 || end<0) fail('occurrence endpoint glyph resolver missing');
  const endpointBlock=annotator.slice(start,end);
  if(!endpointBlock.replace(/\s+/g,'').includes('constcyTop=y+height*0.5;')) fail('endpoint tie-breaker top-origin glyph contract missing');
  if(endpointBlock.includes('pageHeight-cyPdf')) fail('endpoint tie-breaker still mirrors glyph Y');
}
if(!annotator.includes('scoreGesturePointsAgainstTopRects')) fail('candidate geometry gesture scorer missing');
if(!annotatorCompact.includes('verticalOverlapRatio(a,b)>=0.45')) fail('vertical-overlap glyph line grouping missing');
if(annotator.includes('Math.abs(l.cy - cy) <= 4.5')) fail('legacy fixed center-Y glyph line grouping still active');
if(!annotator.includes("if (mappedText && /\\s/u.test(mappedText[i] || '')) continue;")) fail('whitespace glyph suppression missing');
{
  const fnNames=['glyphRectsForRawRange','dedupeAndMergeRects','pointToTopRectDistance','scoreGesturePointsAgainstTopRects'];
  const snippet=fnNames.map(name=>extractNamedFunction(annotator,name)).join('\n\n');
  const smoke=`${snippet}\n(() => {
    // Whitespace belongs to logical text but must not create a tiny QuadPoint.
    const glyphs=[
      {tightOrigin:{x:0,y:10},tightSize:{width:5,height:10}},
      {tightOrigin:{x:5,y:10},tightSize:{width:3,height:1}},
      {tightOrigin:{x:8,y:10},tightSize:{width:5,height:10}}
    ];
    const hit=glyphRectsForRawRange(glyphs,0,2,0,null,'a b');
    if(hit.rects.length!==2) throw new Error('whitespace glyph was not suppressed');

    // Reproduce the title failure shape: two interleaved groups from the SAME
    // visual line overlap vertically by ~70 %. They must collapse to one line.
    const sameLine=dedupeAndMergeRects([{pageIndex:0,rects:[
      {origin:{x:284,y:563},size:{width:178,height:26}},
      {origin:{x:266,y:556},size:{width:69,height:25}}
    ]}]);
    if(sameLine.mergedRects.length!==1) throw new Error('descender line split regression');
    const m=sameLine.mergedRects[0];
    if(Math.abs(m.origin.x-266)>0.001 || Math.abs((m.origin.x+m.size.width)-462)>0.001) throw new Error('merged title geometry bounds wrong');

    // Two actual title lines do not substantially overlap and must stay separate.
    const twoLines=dedupeAndMergeRects([{pageIndex:0,rects:[
      {origin:{x:266,y:556},size:{width:196,height:33}},
      {origin:{x:96,y:520},size:{width:180,height:26}}
    ]}]);
    if(twoLines.mergedRects.length!==2) throw new Error('distinct title lines merged');

    // "for" occurrence identity: physical click in the first whole word must
    // beat the legal substring "for" inside a later word. No word-boundary rule.
    const points=[{pageIndex:0,x:240,y:230},{pageIndex:0,x:240,y:230}];
    const wanted=[{pageIndex:0,left:223,right:265,top:208,bottom:252}];
    const substring=[{pageIndex:0,left:348,right:391,top:244,bottom:288}];
    const a=scoreGesturePointsAgainstTopRects(points,wanted);
    const b=scoreGesturePointsAgainstTopRects(points,substring);
    if(!(a.score===0 && b.score>50)) throw new Error('physical duplicate-text occurrence scoring failed');
  })();`;
  try { cp.execFileSync(process.execPath,['-e',smoke],{cwd:ROOT,stdio:'pipe',encoding:'utf8'}); }
  catch(e){ fail(`native identity/geometry smoke failed\n${e.stderr||e.message}`); }
}

for(const legacyGeneratedDir of ['platform','selection']){
  if(fs.existsSync(path.join(ROOT,legacyGeneratedDir))) fail(`legacy generated source mirror returned: ${legacyGeneratedDir}/`);
}
if(fs.existsSync(path.join(ROOT,'src/main-bridge/main-bridge.js'))) fail('monolithic src/main-bridge/main-bridge.js returned');
const bridgePartSource = MAIN_BRIDGE_FEATURE_ORDER.map(name=>read(`src/main-bridge/features/${name}`)).join('\n');
for(const symbol of [
  'createEmbeddedPdfTargetAdapter','createActivePdfTargetAdapter','createPdfIframeAdapter',
  'createPdfWrapperFrameAdapter','createBrowserWindowAdapter','createScreenPointAdapter','createObsidianCommandDispatchAdapter'
]){
  if(new RegExp(`function\\s+${symbol}\\s*\\(`).test(bridgePartSource)) fail(`canonical platform function duplicated in Main Bridge part: ${symbol}`);
}
for(const file of MAIN_BRIDGE_PLATFORM_ORDER){
  if(!fs.existsSync(path.join(ROOT,'src/platform',file))) fail(`canonical Main Bridge platform source missing: ${file}`);
}

const relativeRequire = /require\s*\(\s*['"]\.\.?\//;
if(relativeRequire.test(main)) fail('main.js contains runtime-relative require');
if(relativeRequire.test(bridge)) fail('main-bridge.js contains runtime-relative require');

if(!main.includes('syncFocusRetestDiagnosticsPolling()')) fail('diagnostics polling lifecycle helper missing');
if(!main.includes('native-resolved-range-exact-geometry')) fail('native exact geometry handoff missing from generated main.js');
if(!annotator.includes('resolvedGeometry')) fail('annotator resolvedGeometry output missing');
if(!main.includes('forceResolveIdentity=options?.forceResolveIdentity === true')) fail('forced native identity resolution option missing');
if(!main.includes("resolveNativeIdentity = contextEvent?.selectionSource === 'native-context-selection'")) fail('context menu native identity gate missing');
if(!main.includes("filterApplied ? String(result?.filteredText||'') : rawText")) fail('header/footer ON must preserve raw outward text after identity analysis');
{
  const menuFn=read('src/plugin/features/05-context-menu.js');
  if(!menuFn.includes('async showPdfContextOverlayAsync(contextEvent)')) fail('context menu method missing');
  const direct=menuFn.indexOf('inspectDirectHighlightContextForMenu');
  const selection=menuFn.indexOf('inspectSelectionContextForMenu');
  if(direct<0||selection<0||direct>=selection) fail('existing-highlight-first menu priority contract missing');
}
if(!main.includes("const RUNTIME_COMPATIBILITY_CONTRACT_VERSION = '0.2'")) fail('runtime compatibility contract missing from generated main.js');
if(!main.includes("supportedObsidianVersion: '1.13.7'")) fail('supported Obsidian runtime missing');
if(!main.includes('supportedElectronMajor: 43')) fail('supported Electron runtime missing');
if(!main.includes("evaluateRuntimeCompatibilityGate('main-bridge-install', true)")) fail('runtime compatibility startup gate missing');
if(!main.includes('copy-runtime-compatibility-status')) fail('runtime compatibility diagnostic command missing');
if(!main.includes('runtimeCompatibility: this.state.diagnostics.runtimeCompatibility || null')) fail('runtime compatibility diagnostic export missing');
if(!main.includes("const MAIN_PROCESS_TRANSPORT_CONTRACT_VERSION = '0.2'")) fail('MainProcessTransport contract missing from generated main.js');
if(!main.includes('this.mainProcessTransport = createMainProcessTransport')) fail('MainProcessTransport composition binding missing');
if(main.includes('this.focusMainBridge =')) fail('raw Main Bridge module reference leaked back into renderer plugin');
if(main.includes('this.electronRemoteRequireAdapter.requireInMain(')) fail('renderer production code bypasses MainProcessTransport load boundary');
if(!main.includes("const PDF_BACKUP_DIR_NAME = '.pdfium-backup';")) fail('hidden .pdfium-backup routing constant missing');
if(main.includes("const PDF_BACKUP_DIR_NAME = '_pdfium-backup';")) fail('legacy visible _pdfium-backup routing is still active');
if(!main.includes('this.nodeFilesystemAdapter.statKind(backupDirFsPath)')) fail('hidden backup filesystem directory probe missing');
if(!main.includes('this.nodeFilesystemAdapter.copyFile(sourceFsPath, backupFsPath)')) fail('hidden backup filesystem copy missing');
if(main.includes('obsidianVaultWriteAdapter.createBinary(workTarget.backupPath, original)')) fail('hidden backup still writes through Vault createBinary');


};
