'use strict';

function createPluginState() {
  return {
    lifecycle:{
      originalPdfViewType:null,
      overrideInstalled:false,
      pdfRuntimeRegistration:{seq:0,last:null,reconcileSeq:0,lastReconcile:null}
    },
    navigation: {
      lastKnownPdfFilePath: null,
      lastContextNavigationState: null,
      lastResolvedPdfIdentity: null,
      pendingPages: new Map(),
      linkLocatorAttemptSeq: 0,
      lastLinkLocatorRestore: null,
      lastSelectionLinkDiagnostic: null,
      lastNativeSelectionIdentityDiagnostic: null,
      lastPdfLeafReuse: null,
      lastInterceptedLink: null,
      activePdfIdentity: { seq:0, last:null },
      lastExistingCategoryCopyArtifactFilter: null
    },
    http: {
      server: null,
      port: null,
      tokenMap: new Map()
    },
    annotation: {
      frame: null,
      frameReady: null,
      requests: new Map(),
      messageHandler: null,
      keyboardTextModelPrewarm: { seq:0, last:null }
    },
    bridge: {
      rendererWindows: new Set(),
      command: { state:{seq:0,last:null}, handler:null },
      keyboardSelection: { state:{seq:0,last:null,busy:false}, queue:Promise.resolve(), handler:null },
      nativeCopy: { state:{seq:0,last:null,busy:false}, queue:Promise.resolve(), handler:null },
      keyboardCopy: { state:{seq:0,last:null,busy:false}, queue:Promise.resolve(), handler:null },
      contextMenu: { state:{seq:0,last:null}, handler:null },
      categoryShortcut: { state:{seq:0,last:null}, handler:null },
      escapeDismiss: { state:{seq:0,last:null}, handler:null },
      pdfMouseActivation: { state:{seq:0,last:null}, handler:null }
    },
    diagnostics: {
      focusRetest: {
        installed:false,
        method:null,
        installError:null,
        focusHistory:[],
        inputEvents:[],
        contextMenuEvents:[],
        contextMenuActions:[],
        listenerCount:0,
        initialExistingCount:0
      },
      focusRetestListeners: new Map(),
      focusRetestCreatedSubscription: null,
      focusRetestPollTimer: null,
      focusRetestLastSignature: null,
      mainBridge: {
        state:null,
        fileState:null,
        lastSnapshotAt:null
      },
      lastPlatformCapabilityReport: null,
      runtimeCompatibility: null
    },
    metadata: {
      schema: null,
      loaded: false,
      lastError: null,
      lastBackupPath: null
    },
    documentInfo: {
      panelOpen: false,
      editingPdfPath: null
    },
    documentRecords: {
      initialized: false,
      readyPromise: null,
      warmupIdleHandle: null,
      warmupScheduledAtMs: null,
      warmupScheduleMode: null,
      warmupLayoutReady: false,
      warmupMetadataResolved: false,
      warmupGateOrder: '',
      operationQueue: Promise.resolve(),
      byPdfPath: new Map(),
      byId: new Map(),
      entryByRecordPath: new Map(),
      recordPathsById: new Map(),
      idsByPdfPath: new Map(),
      ambiguousIds: new Set(),
      ambiguousPdfPaths: new Set(),
      lastError: null,
      lastBuildMetrics: null,
      benchmarkEventSuppression: false
    },
    context: {
      overlay:null,
      overlayCleanup:null,
      autoHighlightInFlight:false,
      lastAutoHighlight:null,
      lastEffectiveCategoryConfig:null,
      mouseLeafActivationInFlight:false,
      lastMouseLeafActivation:null
    }
  };
}

module.exports={createPluginState};
