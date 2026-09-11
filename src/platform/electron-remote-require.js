'use strict';

// Electron 43 renderer -> main transport-only adapter. electron.remote.require() is
// intentionally retained here; it is not a PDF hosting/targeting mechanism.
const ELECTRON_REMOTE_REQUIRE_CONTRACT_VERSION = '0.1';
function createElectronRemoteRequireAdapter({ electronModule }) {
  function getCapabilities() {
    const remote=electronModule&&electronModule.remote;
    return {
      remoteAvailable:!!remote,
      requireFunction:typeof remote?.require==='function'
    };
  }
  function requireInMain(modulePath) {
    const target=String(modulePath||'').trim();
    if(!target) return {ok:false,modulePath:null,module:null,reason:'missing-module-path',error:'Main-process modulsti mangler'};
    const remote=electronModule&&electronModule.remote;
    if(!remote||typeof remote.require!=='function') return {ok:false,modulePath:target,module:null,reason:'remote-require-unavailable',error:"require('electron').remote.require er ikke tilgjengelig"};
    try { return {ok:true,modulePath:target,module:remote.require(target),reason:'exact-remote-require',error:null}; }
    catch(error){ return {ok:false,modulePath:target,module:null,reason:'remote-require-failed',error:error instanceof Error?error.message:String(error)}; }
  }
  return Object.freeze({contractVersion:ELECTRON_REMOTE_REQUIRE_CONTRACT_VERSION,getCapabilities,requireInMain});
}
module.exports={ELECTRON_REMOTE_REQUIRE_CONTRACT_VERSION,createElectronRemoteRequireAdapter};
