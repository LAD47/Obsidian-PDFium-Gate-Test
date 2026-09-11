'use strict';

const MAIN_BRIDGE_FEATURE_CLASSES = Object.freeze({
  kernel: MainBridgeKernelFeature,
  identityLocator: MainBridgeIdentityLocatorFeature,
  contextMenu: MainBridgeContextMenuFeature,
  selectionCapture: MainBridgeSelectionCaptureFeature,
  selectionOperations: MainBridgeSelectionOperationsFeature,
  inputRouter: MainBridgeInputRouterFeature,
  wrapperLifecycle: MainBridgeWrapperLifecycleFeature,
  lifecycle: MainBridgeLifecycleFeature
});

function createBoundMainBridgePorts(host) {
  const ports = Object.create(null);
  const owners = Object.create(null);
  for (const [featureId, featureClass] of Object.entries(MAIN_BRIDGE_FEATURE_CLASSES)) {
    for (const name of Object.getOwnPropertyNames(featureClass.prototype)) {
      if (name === 'constructor') continue;
      const descriptor = Object.getOwnPropertyDescriptor(featureClass.prototype, name);
      if (!descriptor || typeof descriptor.value !== 'function') continue;
      if (ports[name]) throw new Error(`Duplicate Main Bridge port provider ${name}: ${owners[name]} / ${featureId}`);
      ports[name] = descriptor.value.bind(host);
      owners[name] = featureId;
    }
  }
  for (const [featureId, contract] of Object.entries(MAIN_BRIDGE_FEATURE_CONTRACTS)) {
    for (const port of contract.ports || []) {
      if (typeof ports[port] !== 'function') throw new Error(`Unknown Main Bridge port ${featureId} -> ${port}`);
    }
  }
  return Object.freeze(ports);
}

class MainBridgeRuntime {
  constructor() {
    this.ports = createBoundMainBridgePorts(this);

    this.state = this.ports.freshState();
    this.runtime = {
      lifecycle:{webContentsCreatedHandler:null},
      contextMenu:{listeners:new Map(),filteredListeners:new Map(),newListenerWatchers:new Map()},
      shortcuts:{triggerCounter:0},
      wrapperRuntime:{pollers:new Map(),frameLifecycleListeners:new Map(),registrationInFlight:new Map()},
      keyboard:{
        inputListeners:new Map(),
        syntheticCtrlCUntil:0,
        routeDedupe:new Map(),
        selection:null,
        selectionRouteChain:Promise.resolve(),
        nativeMouseCopyRouteInFlight:false,
        nativeClearInputProbe:null,
        selectionMouseClearInFlight:false
      },
      targets:{activePdfTargetAdapter:null,embeddedPdfTargetCache:new Map()}
    };

    this.chromiumPdfRuntimeDriver = createChromiumPdfRuntimeDriver();
    this.rendererEventDispatchAdapter = createRendererEventDispatchAdapter({validateDetail:validateRendererBridgeEventDetail});

    this.embeddedPdfTargetAdapter = createEmbeddedPdfTargetAdapter({
      webContents,
      listFrameSubtree:this.ports.listFrameSubtree,
      pdfTokenFromWrapperFrameUrl,
      createEmbeddedPdfTarget:this.ports.createEmbeddedPdfTarget,
      onResolved:this.ports.recordEmbeddedPdfTargetResolution
    });
    this.runtime.targets.activePdfTargetAdapter = createActivePdfTargetAdapter({
      resolveExactPdf:this.ports.resolveEmbeddedPdfTargetExact,
      getFocusedWebContents:()=>webContents.getFocusedWebContents(),
      focusMatchesToken:this.ports.webContentsFocusMatchesPdfToken,
      focusedPdfToken:this.ports.focusedPdfTokenForWebContents
    });

    this.pdfIframeAdapter = createPdfIframeAdapter();
    this.pdfWrapperFrameAdapter = createPdfWrapperFrameAdapter({listFrameSubtree:this.ports.listFrameSubtree});
    this.browserWindowAdapter = createBrowserWindowAdapter({BrowserWindow});
    this.screenPointAdapter = createScreenPointAdapter({screen});
    this.obsidianCommandDispatchAdapter = createObsidianCommandDispatchAdapter({rendererEventDispatchAdapter:this.rendererEventDispatchAdapter});
  }
}

const mainBridgeRuntime = new MainBridgeRuntime();

module.exports = {
  install: mainBridgeRuntime.ports.install,
  uninstall: mainBridgeRuntime.ports.uninstall,
  getState: mainBridgeRuntime.ports.getState,
  getPlatformCapabilities: mainBridgeRuntime.ports.getPlatformCapabilities,
  setRendererMenuOpen: mainBridgeRuntime.ports.setRendererMenuOpen,
  setKeyboardSelection: mainBridgeRuntime.ports.setKeyboardSelection,
  clearKeyboardSelection: mainBridgeRuntime.ports.clearKeyboardSelection,
  reportKeyboardSelectionResult: mainBridgeRuntime.ports.reportKeyboardSelectionResult,
  showLinkLocator: mainBridgeRuntime.ports.showLinkLocator,
  setActivePdfIdentity: mainBridgeRuntime.ports.setActivePdfIdentity,
  focusPdfRuntime: mainBridgeRuntime.ports.focusPdfRuntime,
  ensurePdfRuntime: mainBridgeRuntime.ports.ensurePdfRuntime,
  setIncludeHeaderFooterText: mainBridgeRuntime.ports.setIncludeHeaderFooterText
};
