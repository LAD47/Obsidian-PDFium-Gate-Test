'use strict';

const PLATFORM_CONTRACT_VERSION = '0.3';

function safeError(error) { return error instanceof Error ? error.message : String(error); }

function detectEnvironment(meta = {}) {
  let obsidianVersion=meta.obsidianVersion||null;
  let obsidianModule=null;
  try{obsidianModule=require('obsidian');obsidianVersion=obsidianVersion||obsidianModule?.version||obsidianModule?.apiVersion||null;}catch(_){}
  return {
    contractVersion:PLATFORM_CONTRACT_VERSION,
    generatedAt:new Date().toISOString(),
    plugin:{id:meta.pluginId||null,version:meta.pluginVersion||null,minAppVersion:meta.minAppVersion||null},
    obsidian:{version:obsidianVersion,moduleLoaded:!!obsidianModule},
    process:{type:typeof process!=='undefined'?(process.type||null):null,platform:typeof process!=='undefined'?(process.platform||null):null,arch:typeof process!=='undefined'?(process.arch||null):null,pid:typeof process!=='undefined'?(process.pid||null):null,versions:typeof process!=='undefined'&&process.versions?{electron:process.versions.electron||null,chrome:process.versions.chrome||null,node:process.versions.node||null,v8:process.versions.v8||null}:null},
    navigator:typeof navigator!=='undefined'?{userAgent:navigator.userAgent||null,platform:navigator.platform||null,language:navigator.language||null}:null
  };
}

function detectRendererCapabilities() {
  const report={
    contractVersion:PLATFORM_CONTRACT_VERSION,
    generatedAt:new Date().toISOString(),
    electron:{loadOk:false,error:null,exports:{}}
  };
  try{
    const electron=require('electron');
    report.electron.loadOk=true;
    for(const name of ['clipboard','ipcRenderer','webFrame','shell','nativeImage','contextBridge']) report.electron.exports[name]=!!electron?.[name];
  }catch(error){report.electron.error=safeError(error);}
  return JSON.parse(JSON.stringify(report));
}

module.exports={PLATFORM_CONTRACT_VERSION,detectEnvironment,detectRendererCapabilities};
