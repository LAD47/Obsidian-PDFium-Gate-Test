'use strict';
const ctx=require('../context');

module.exports=function verifyContract(){
  const {
    fs,path,ROOT,fail,read,
    SHARED_BRIDGE_ORDER,ANNOTATOR_MESSAGE_CONTRACT_ORDER,RENDERER_FOUNDATION_ORDER,RENDERER_POST_NORMALIZATION_CORE_ORDER,
    MAIN_BRIDGE_RUNTIME_ORDER,MAIN_BRIDGE_PLATFORM_ORDER,MAIN_BRIDGE_FEATURE_ORDER,PLUGIN_FEATURE_ORDER,
    ANNOTATOR_RUNTIME_ORDER,buildMainBridgeSource,buildPluginSource,buildAnnotatorSource
  }=ctx;

  const exists=rel=>fs.existsSync(path.join(ROOT,rel));
  const sourceFiles=[];
  const walk=dir=>{
    for(const ent of fs.readdirSync(path.join(ROOT,dir),{withFileTypes:true})){
      const rel=path.join(dir,ent.name);
      if(ent.isDirectory()) walk(rel);
      else if(/\.(?:js|html|md)$/.test(ent.name)) sourceFiles.push(rel.replace(/\\/g,'/'));
    }
  };
  walk('src');

  // Old monoliths and generated source mirrors must not return.
  for(const rel of [
    'src/main-bridge/main-bridge.js',
    'src/main/10-core-before-normalization.js',
    'src/main/20-core-after-normalization.js',
    'src/main-bridge/parts/40-selection-input.part.js',
    'src/main-bridge/parts/00-header.part.js',
    'src/main-bridge/parts/05-runtime-state.part.js',
    'src/plugin/20-context-selection.part.js',
    'src/plugin/00-onload.part.js',
    'src/plugin/90-install-unload.part.js',
    'src/annotator/annotator.html',
    'src/annotator/runtime-message-handler.js',
    'platform','selection'
  ]) if(exists(rel)) fail(`structural legacy path returned: ${rel}`);

  const assertUniqueOrder=(label,items,dir)=>{
    if(new Set(items).size!==items.length) fail(`${label} contains duplicate source entries`);
    for(const name of items) if(!exists(`${dir}/${name}`)) fail(`${label} source missing: ${name}`);
  };
  assertUniqueOrder('shared bridge order',SHARED_BRIDGE_ORDER,'src/bridge');
  assertUniqueOrder('annotator message contract order',ANNOTATOR_MESSAGE_CONTRACT_ORDER,'src/bridge');
  assertUniqueOrder('renderer foundation order',RENDERER_FOUNDATION_ORDER,'src/core');
  assertUniqueOrder('renderer post-normalization core order',RENDERER_POST_NORMALIZATION_CORE_ORDER,'src/core');
  assertUniqueOrder('Main Bridge runtime order',MAIN_BRIDGE_RUNTIME_ORDER,'src/runtime');
  assertUniqueOrder('Main Bridge platform order',MAIN_BRIDGE_PLATFORM_ORDER,'src/platform');
  assertUniqueOrder('Main Bridge feature order',MAIN_BRIDGE_FEATURE_ORDER,'src/main-bridge/features');
  assertUniqueOrder('plugin feature order',PLUGIN_FEATURE_ORDER,'src/plugin/features');
  assertUniqueOrder('annotator runtime order',ANNOTATOR_RUNTIME_ORDER,'src/annotator');

  const bridgeSource=buildMainBridgeSource(ROOT);
  const pluginSource=buildPluginSource(ROOT);
  const annotatorSource=buildAnnotatorSource(ROOT);
  if(!bridgeSource.includes('// BEGIN GENERATED SHARED BRIDGE CONTRACTS')) fail('Main Bridge shared-contract bundle marker missing');
  if(!bridgeSource.includes('// BEGIN GENERATED MAIN-BRIDGE RUNTIME CONTRACTS')) fail('Main Bridge runtime bundle marker missing');
  if(!bridgeSource.includes('// BEGIN GENERATED MAIN-BRIDGE PLATFORM CONTRACTS')) fail('Main Bridge platform bundle marker missing');
  if(!annotatorSource.startsWith('<!doctype html>')||!annotatorSource.includes("window.addEventListener('message', async event => {")||!annotatorSource.endsWith('</html>')) fail('annotator assembly contract broken');

  // One physical owner for the RuntimeDriver implementation.
  const runtimeFactoryOccurrences=sourceFiles
    .filter(rel=>rel.endsWith('.js'))
    .reduce((n,rel)=>n+(read(rel).match(/function createChromiumPdfRuntimeDriver\(/g)||[]).length,0);
  if(runtimeFactoryOccurrences!==1) fail(`RuntimeDriver must have one physical implementation, found ${runtimeFactoryOccurrences}`);
  if(!read('src/runtime/chromium-pdf-runtime-driver.js').includes('function createChromiumPdfRuntimeDriver(')) fail('canonical RuntimeDriver source missing');

  // Renderer transport names have one source of truth.
  const eventContract=read('src/bridge/renderer-events.js');
  for(const eventName of ['pdfium-gate-obsidian-command','pdfium-gate-pdf-keyboard-selection','pdfium-gate-native-copy','pdfium-gate-keyboard-copy','pdfium-gate-pdf-context-menu','pdfium-gate-category-shortcut','pdfium-gate-escape-dismiss','pdfium-gate-pdf-mouse-activation']){
    if(!eventContract.includes(eventName)) fail(`renderer event missing from canonical contract: ${eventName}`);
    const elsewhere=sourceFiles.filter(rel=>rel!=='src/bridge/renderer-events.js'&&rel.endsWith('.js')&&read(rel).includes(eventName));
    if(elsewhere.length) fail(`renderer event literal escaped canonical contract (${eventName}): ${elsewhere.join(', ')}`);
  }
  if(!bridgeSource.includes('RENDERER_BRIDGE_EVENTS.KEYBOARD_COPY')) fail('Main Bridge keyboard-copy event does not use shared contract');
  if(!pluginSource.includes('RENDERER_BRIDGE_EVENTS.KEYBOARD_COPY')) fail('renderer keyboard-copy listener does not use shared contract');

  // State ownership guards: runtime control state and public diagnostics are separate.
  if(bridgeSource.includes('state.runtime.')) fail('Main Bridge public diagnostic state is being used as runtime control state');
  if(pluginSource.includes('this.contextMenuActions')) fail('flat renderer diagnostic state returned');
  if((bridgeSource.match(/async routeKeyboardSelectionCopyFromPdf\(/g)||[]).length!==1) fail('keyboard copy route must have exactly one implementation');
  if(!bridgeSource.includes('void __bridgeRuntime.ports.routeKeyboardSelectionCopyFromPdf(pdfTarget, __bridgeRuntime.runtime.keyboard.selection, source);')) fail('keyboard copy input route does not reach canonical implementation');

  // renderer electron.remote has exactly one production boundary.
  const remoteReaders=sourceFiles.filter(rel=>rel.endsWith('.js')&&/electronModule\.remote|rendererElectronModule\.remote/.test(read(rel)));
  if(remoteReaders.length!==1||remoteReaders[0]!=='src/platform/electron-remote-require.js') fail(`renderer electron.remote boundary drifted: ${remoteReaders.join(', ')||'none'}`);

  return {
    sourceFileCount:sourceFiles.length,
    mainBridgeFeatureCount:MAIN_BRIDGE_FEATURE_ORDER.length,
    pluginFeatureCount:PLUGIN_FEATURE_ORDER.length
  };
};
