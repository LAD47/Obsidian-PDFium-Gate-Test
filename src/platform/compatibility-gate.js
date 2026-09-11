'use strict';

const RUNTIME_COMPATIBILITY_CONTRACT_VERSION = '0.2';
const RUNTIME_COMPATIBILITY_POLICY = Object.freeze({
  supportedObsidianVersion: '1.13.7',
  supportedElectronMajor: 43,
  supportedHostingMode: 'embedded-frame'
});

function parseVersionTuple(value) {
  const raw=String(value||'').trim();
  const match=raw.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if(!match) return null;
  return {raw,major:Number(match[1]||0),minor:Number(match[2]||0),patch:Number(match[3]||0)};
}

function capabilityValue(capabilities,name) {
  if(!capabilities||typeof capabilities!=='object') return null;
  const value=capabilities[name];
  return typeof value==='boolean'?value:null;
}

function evaluateRuntimeCompatibility(input={}) {
  const policy=RUNTIME_COMPATIBILITY_POLICY;
  const obsidian=parseVersionTuple(input.obsidianVersion);
  const electron=parseVersionTuple(input.electronVersion);
  const hostingMode=String(input.hostingMode||'').trim()||null;
  const mainCapabilities=input.mainCapabilities&&typeof input.mainCapabilities==='object'?input.mainCapabilities:null;
  const mainBridgeInstalled=typeof input.mainBridgeInstalled==='boolean'?input.mainBridgeInstalled:null;
  const rendererMainBridgeRequireAvailable=typeof input.rendererMainBridgeRequireAvailable==='boolean'?input.rendererMainBridgeRequireAvailable:null;

  const version={
    obsidian:{value:obsidian?.raw||null,state:!obsidian?'unknown':obsidian.raw===policy.supportedObsidianVersion?'supported':'unsupported',supported:policy.supportedObsidianVersion},
    electron:{value:electron?.raw||null,major:electron?.major??null,state:!electron?'unknown':electron.major===policy.supportedElectronMajor?'supported-major':'unsupported',supportedMajor:policy.supportedElectronMajor}
  };
  const hosting={mode:hostingMode,state:!hostingMode?'unknown':hostingMode===policy.supportedHostingMode?'supported':'unsupported'};

  const checks=[
    ['webContentsGetAll',capabilityValue(mainCapabilities,'webContentsGetAll')],
    ['webContentsGetFocused',capabilityValue(mainCapabilities,'webContentsGetFocused')],
    ['beforeInputEventEmbeddedRouting',capabilityValue(mainCapabilities,'beforeInputEventEmbeddedRouting')],
    ['clipboardReadText',capabilityValue(mainCapabilities,'clipboardReadText')],
    ['clipboardWriteText',capabilityValue(mainCapabilities,'clipboardWriteText')],
    ['rendererMainBridgeRequireAvailable',rendererMainBridgeRequireAvailable],
    ['mainBridgeInstalled',mainBridgeInstalled]
  ].map(([name,value])=>({name,value,required:true}));
  const missing=checks.filter(x=>x.value===false).map(x=>x.name);
  const unknown=checks.filter(x=>x.value===null).map(x=>x.name);

  const runtimeKnown=!!obsidian&&!!electron&&!!hostingMode;
  const runtimeSupported=version.obsidian.state==='supported'&&version.electron.state==='supported-major'&&hosting.state==='supported';
  let status='verified', severity='ok';
  if(runtimeKnown&&!runtimeSupported){status='unsupported-runtime';severity='error';}
  else if(missing.length){status='capability-limited';severity='error';}
  else if(!runtimeKnown||unknown.length){status='unknown';severity='warning';}

  return {
    contractVersion:RUNTIME_COMPATIBILITY_CONTRACT_VERSION,
    evaluatedAt:new Date().toISOString(),
    status,severity,
    operational:runtimeSupported&&missing.length===0&&mainBridgeInstalled!==false,
    supportedRuntime:runtimeSupported,
    requiredCapabilitiesPresent:missing.length===0,
    policy:{...policy},
    version,
    runtime:{chromeVersion:String(input.chromeVersion||'').trim()||null,nodeVersion:String(input.nodeVersion||'').trim()||null},
    hosting,
    capabilities:{checks,missing,unknown}
  };
}

function compatibilityNoticeText(result,pluginVersion) {
  const r=result||{};
  const obsidian=r?.version?.obsidian?.value||'?';
  const electron=r?.version?.electron?.value||'?';
  const prefix=`PDFium ${pluginVersion}:`;
  if(r.status==='unsupported-runtime') return `${prefix} IKKE STØTTET runtime — Obsidian ${obsidian}, Electron ${electron}, hosting ${r?.hosting?.mode||'?'}. Støttet kontrakt er Obsidian ${r.policy?.supportedObsidianVersion||'?'} + Electron ${r.policy?.supportedElectronMajor||'?'} + ${r.policy?.supportedHostingMode||'?'}.`;
  if(r.status==='capability-limited') return `${prefix} runtime mangler nødvendige capabilities: ${(r?.capabilities?.missing||[]).join(', ')||'ukjent'}.`;
  if(r.status==='unknown') return `${prefix} runtime kunne ikke verifiseres fullt ut mot den støttede Electron-43 embedded-frame-kontrakten.`;
  return `${prefix} runtime verifisert — Obsidian ${obsidian}, Electron ${electron}, hosting ${r?.hosting?.mode||'?'}.`;
}

module.exports={RUNTIME_COMPATIBILITY_CONTRACT_VERSION,RUNTIME_COMPATIBILITY_POLICY,parseVersionTuple,evaluateRuntimeCompatibility,compatibilityNoticeText};
