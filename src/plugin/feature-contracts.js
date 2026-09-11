'use strict';

// Plugin feature contracts: feature implementations depend only on named ports,
// never on peer feature implementations. Mutable state has one explicit field writer.
const PLUGIN_FEATURE_CONTRACTS = Object.freeze({
  "lifecycle": {
    "file": "01-lifecycle.js",
    "className": "LifecycleFeature",
    "stateDomains": [
      "navigation",
      "lifecycle",
      "http"
    ],
    "ports": [
      "installAnnotatorMessageListener",
      "ensureRootCategoryConfigInitialized",
      "initializeMetadataSchema",
      "registerPdfDocumentRegisterBasesView",
      "registerMetadataBenchmarkCommands",
      "markDocumentRecordLayoutReady",
      "markDocumentRecordMetadataResolved",
      "cancelDocumentRecordIndexWarmup",
      "applyDocumentRecordVisibility",
      "toggleDocumentRecordVisibility",
      "clearDocumentRecordVisibility",
      "handleDocumentRecordVaultCreate",
      "handleDocumentRecordVaultModify",
      "handleDocumentRecordVaultRename",
      "handleDocumentRecordVaultDelete",
      "refreshDocumentInfoViews",
      "handleDocumentInfoActiveLeafChange",
      "openDocumentInfoForView",
      "configureRendererBridgeHandlers",
      "registerRendererBridgeWindow",
      "closePdfContextOverlay",
      "syncActivePdfIdentity",
      "getActiveReader",
      "getCommandTargetPdfFile",
      "openCategoryEditor",
      "openEffectiveCategoryConfig",
      "addDiagnosticCommand",
      "toggleDiagnostics",
      "openFocusRetestDiagnostic",
      "copyPlatformCapabilityReport",
      "copyRuntimeCompatibilityStatus",
      "installOpenLinkTextHook",
      "installFocusRetestDiagnostics",
      "installMainProcessUxBridge",
      "reconcileOpenPdfRuntimes",
      "shutdownAnnotatorHost",
      "resetLinkLocatorLifecycleState",
      "unregisterRendererBridgeWindows",
      "clearRendererBridgeHandlers",
      "disposeDiagnosticsRuntime",
      "resetMainBridgeDiagnosticState"
    ],
    "mutableStateFields": [
      "lifecycle.originalPdfViewType",
      "lifecycle.overrideInstalled"
    ]
  },
  "rendererBridge": {
    "file": "02-renderer-bridge.js",
    "className": "RendererBridgeFeature",
    "stateDomains": [
      "bridge"
    ],
    "ports": [
      "handlePdfKeyboardSelectionRequest",
      "handlePdfNativeCopyRequest",
      "handlePdfKeyboardCopyRequest",
      "handlePdfContextMenuBridgeEvent",
      "handleCategoryShortcutBridgeEvent",
      "handleEscapeDismissBridgeEvent",
      "handlePdfMouseActivationBridgeEvent"
    ],
    "mutableStateFields": [
      "bridge.command.handler",
      "bridge.command.state",
      "bridge.keyboardSelection.handler",
      "bridge.keyboardSelection.queue",
      "bridge.nativeCopy.handler",
      "bridge.nativeCopy.queue",
      "bridge.keyboardCopy.handler",
      "bridge.keyboardCopy.queue",
      "bridge.contextMenu.handler",
      "bridge.categoryShortcut.handler",
      "bridge.escapeDismiss.handler",
      "bridge.pdfMouseActivation.handler",
      "bridge.rendererWindows"
    ]
  },
  "diagnostics": {
    "file": "03-diagnostics.js",
    "className": "DiagnosticsFeature",
    "stateDomains": [
      "navigation",
      "diagnostics",
      "bridge",
      "annotation",
      "context"
    ],
    "ports": [
      "getActiveReader",
      "refreshMainBridgeDiagnosticSnapshot"
    ],
    "mutableStateFields": [
      "navigation.lastNativeSelectionIdentityDiagnostic",
      "diagnostics.focusRetestPollTimer",
      "diagnostics.focusRetest.listenerCount",
      "diagnostics.focusRetestCreatedSubscription",
      "diagnostics.focusRetestLastSignature",
      "diagnostics.runtimeCompatibility",
      "diagnostics.lastPlatformCapabilityReport",
      "diagnostics.focusRetestListeners"
    ]
  },
  "categoryConfig": {
    "file": "04-category-config.js",
    "className": "CategoryConfigFeature",
    "stateDomains": [
      "context"
    ],
    "ports": [],
    "mutableStateFields": [
      "context.lastEffectiveCategoryConfig"
    ]
  },
  "contextMenu": {
    "file": "05-context-menu.js",
    "className": "ContextMenuFeature",
    "stateDomains": [
      "context",
      "navigation",
      "diagnostics"
    ],
    "ports": [
      "getVisibleCategories",
      "inspectPointHighlightsWithAnnotator",
      "findSelectionWithAnnotator",
      "inspectSelectionHighlightsWithAnnotator",
      "resolvePdfFileFromBridgePayload",
      "resolveRendererWindowContextForPdfEvent",
      "filterSelectionArtifactsForOutput",
      "recordNativeSelectionIdentityDiagnostic",
      "pushFocusRetestItem",
      "openCategoryEditor",
      "copyObsidianPdfSelectionReference",
      "changeExistingHighlightCategory",
      "runSelectionHighlightTest",
      "copyExistingCategoryReference",
      "removeExistingHighlight"
    ],
    "mutableStateFields": [
      "context.overlayCleanup",
      "context.overlay",
      "navigation.lastContextNavigationState"
    ]
  },
  "selectionLinks": {
    "file": "06-selection-links.js",
    "className": "SelectionLinksFeature",
    "stateDomains": [
      "navigation",
      "diagnostics"
    ],
    "ports": [
      "pushFocusRetestItem"
    ],
    "mutableStateFields": [
      "navigation.lastSelectionLinkDiagnostic"
    ]
  },
  "mainBridgeRouting": {
    "file": "07-main-bridge-routing.js",
    "className": "MainBridgeRoutingFeature",
    "stateDomains": [
      "diagnostics",
      "context",
      "bridge",
      "lifecycle",
      "navigation"
    ],
    "ports": [
      "closePdfContextOverlay",
      "pushFocusRetestItem",
      "showPdfContextOverlay",
      "resolvePdfFileFromBridgePayload",
      "getShortcutCategory",
      "runSelectionHighlightTest",
      "getMainProcessBridgePath",
      "evaluateRuntimeCompatibilityGate"
    ],
    "mutableStateFields": [
      "diagnostics.mainBridge.state",
      "diagnostics.mainBridge.lastSnapshotAt",
      "context.lastMouseLeafActivation",
      "context.mouseLeafActivationInFlight",
      "bridge.pdfMouseActivation.state",
      "bridge.escapeDismiss.state",
      "bridge.contextMenu.state",
      "bridge.categoryShortcut.state",
      "lifecycle.pdfRuntimeRegistration",
      "navigation.activePdfIdentity",
      "diagnostics.mainBridge.fileState"
    ]
  },
  "linkLocator": {
    "file": "08-link-locator.js",
    "className": "LinkLocatorFeature",
    "stateDomains": [
      "navigation",
      "http"
    ],
    "ports": [
      "syncActivePdfIdentity"
    ],
    "mutableStateFields": [
      "navigation.lastLinkLocatorRestore",
      "navigation.lastInterceptedLink",
      "navigation.lastPdfLeafReuse",
      "navigation.lastPdfLeafReuse.reused",
      "navigation.lastPdfLeafReuse.error",
      "navigation.lastResolvedPdfIdentity",
      "navigation.lastKnownPdfFilePath",
      "navigation.pendingPages"
    ]
  },
  "annotatorHost": {
    "file": "09-annotator-host.js",
    "className": "AnnotatorHostFeature",
    "stateDomains": [
      "annotation",
      "http"
    ],
    "ports": [
      "vaultPathToFs"
    ],
    "mutableStateFields": [
      "annotation.messageHandler",
      "http.server",
      "http.port",
      "annotation.frame",
      "annotation.frameReady",
      "http.tokenMap",
      "annotation.requests"
    ]
  },
  "selectionBridge": {
    "file": "10-selection-bridge.js",
    "className": "SelectionBridgeFeature",
    "stateDomains": [
      "annotation",
      "bridge"
    ],
    "ports": [
      "sendAnnotatorRequest",
      "getActiveReader",
      "resolvePdfFileFromBridgePayload"
    ],
    "mutableStateFields": [
      "annotation.keyboardTextModelPrewarm",
      "bridge.keyboardCopy.state",
      "bridge.nativeCopy.state",
      "bridge.keyboardSelection.state"
    ]
  },
  "annotationIo": {
    "file": "11-annotation-io.js",
    "className": "AnnotationIoFeature",
    "stateDomains": [
      "navigation"
    ],
    "ports": [
      "sendAnnotatorRequest",
      "filterSelectionArtifactsForOutput",
      "copyObsidianPdfSelectionReference"
    ],
    "mutableStateFields": [
      "navigation.lastExistingCategoryCopyArtifactFilter"
    ]
  },
  "selectionDiagnostics": {
    "file": "12-selection-diagnostics.js",
    "className": "SelectionDiagnosticsFeature",
    "stateDomains": [],
    "ports": [
      "findSelectionWithAnnotator"
    ],
    "mutableStateFields": []
  },
  "categoryMutation": {
    "file": "13-category-mutation.js",
    "className": "CategoryMutationFeature",
    "stateDomains": [
      "navigation"
    ],
    "ports": [
      "resolveSelectionHighlightWriteTarget",
      "modifyExistingHighlightWithAnnotator",
      "createPdfBackupFromSource",
      "refreshOpenPdfViews",
      "exactSelectionGeometryFromContext",
      "findSelectionWithAnnotator",
      "inspectSelectionHighlightsWithAnnotator",
      "getVisibleCategories",
      "writeSelectionHighlightWithAnnotator",
      "recordNativeSelectionIdentityDiagnostic",
      "writeHighlightWithAnnotator",
      "makeAnnotationTestPath",
      "queuePendingPage"
    ],
    "mutableStateFields": []
  },
  "metadataSchema": {
    "file": "14-metadata-schema.js",
    "className": "MetadataSchemaFeature",
    "stateDomains": [
      "metadata"
    ],
    "ports": [],
    "mutableStateFields": [
      "metadata.schema",
      "metadata.loaded",
      "metadata.lastError",
      "metadata.lastBackupPath"
    ]
  },
  "documentInfo": {
    "file": "15-document-info.js",
    "className": "DocumentInfoFeature",
    "stateDomains": [
      "documentInfo"
    ],
    "ports": [
      "getMetadataSchemaSnapshot",
      "ensureDocumentRecordIndexReady",
      "getDocumentMetadataRecordState",
      "saveDocumentMetadataRecordValues"
    ],
    "mutableStateFields": [
      "documentInfo.panelOpen",
      "documentInfo.editingPdfPath"
    ]
  },
  "documentRecords": {
    "file": "16-document-records.js",
    "className": "DocumentRecordsFeature",
    "stateDomains": [
      "documentRecords"
    ],
    "ports": [
      "getMetadataSchemaSnapshot"
    ],
    "mutableStateFields": [
      "documentRecords.ambiguousIds",
      "documentRecords.ambiguousPdfPaths",
      "documentRecords.byId",
      "documentRecords.byPdfPath",
      "documentRecords.entryByRecordPath",
      "documentRecords.idsByPdfPath",
      "documentRecords.initialized",
      "documentRecords.readyPromise",
      "documentRecords.warmupIdleHandle",
      "documentRecords.warmupScheduledAtMs",
      "documentRecords.warmupScheduleMode",
      "documentRecords.warmupLayoutReady",
      "documentRecords.warmupMetadataResolved",
      "documentRecords.warmupGateOrder",
      "documentRecords.lastError",
      "documentRecords.operationQueue",
      "documentRecords.recordPathsById",
      "documentRecords.lastBuildMetrics",
      "documentRecords.benchmarkEventSuppression"
    ]
  },
  "documentRecordVisibility": {
    "file": "17-document-record-visibility.js",
    "className": "DocumentRecordVisibilityFeature",
    "stateDomains": [],
    "ports": [],
    "mutableStateFields": []
  },
  "documentRegisterBases": {
    "file": "18-document-register-bases.js",
    "className": "DocumentRegisterBasesFeature",
    "stateDomains": [],
    "ports": [
      "getMetadataSchemaSnapshot",
      "resolveDocumentRecordPdfPath",
      "saveDocumentMetadataRecordValues",
      "relinkMissingDocumentRecord"
    ],
    "mutableStateFields": []
  },
  "metadataBenchmark": {
    "file": "19-metadata-benchmark.js",
    "className": "MetadataBenchmarkFeature",
    "stateDomains": [],
    "ports": [
      "getMetadataSchemaSnapshot",
      "setDocumentRecordBenchmarkEventSuppression",
      "ensureDocumentRecordIndexReady",
      "runDocumentRecordIndexBenchmark"
    ],
    "mutableStateFields": []
  }
});

const PLUGIN_STATE_DOMAIN_OWNERS = Object.freeze({
  "lifecycle": "lifecycle",
  "navigation": "mainBridgeRouting",
  "http": "annotatorHost",
  "annotation": "annotatorHost",
  "bridge": "rendererBridge",
  "diagnostics": "diagnostics",
  "context": "contextMenu",
  "metadata": "metadataSchema",
  "documentInfo": "documentInfo",
  "documentRecords": "documentRecords"
});

const PLUGIN_STATE_FIELD_OWNERS = Object.freeze({
  "annotation.frame": "annotatorHost",
  "annotation.frameReady": "annotatorHost",
  "annotation.keyboardTextModelPrewarm": "selectionBridge",
  "annotation.messageHandler": "annotatorHost",
  "annotation.requests": "annotatorHost",
  "bridge.categoryShortcut.handler": "rendererBridge",
  "bridge.categoryShortcut.state": "mainBridgeRouting",
  "bridge.command.handler": "rendererBridge",
  "bridge.command.state": "rendererBridge",
  "bridge.contextMenu.handler": "rendererBridge",
  "bridge.contextMenu.state": "mainBridgeRouting",
  "bridge.escapeDismiss.handler": "rendererBridge",
  "bridge.escapeDismiss.state": "mainBridgeRouting",
  "bridge.keyboardCopy.handler": "rendererBridge",
  "bridge.keyboardCopy.queue": "rendererBridge",
  "bridge.keyboardCopy.state": "selectionBridge",
  "bridge.keyboardSelection.handler": "rendererBridge",
  "bridge.keyboardSelection.queue": "rendererBridge",
  "bridge.keyboardSelection.state": "selectionBridge",
  "bridge.nativeCopy.handler": "rendererBridge",
  "bridge.nativeCopy.queue": "rendererBridge",
  "bridge.nativeCopy.state": "selectionBridge",
  "bridge.pdfMouseActivation.handler": "rendererBridge",
  "bridge.pdfMouseActivation.state": "mainBridgeRouting",
  "bridge.rendererWindows": "rendererBridge",
  "context.lastEffectiveCategoryConfig": "categoryConfig",
  "context.lastMouseLeafActivation": "mainBridgeRouting",
  "context.mouseLeafActivationInFlight": "mainBridgeRouting",
  "context.overlay": "contextMenu",
  "context.overlayCleanup": "contextMenu",
  "diagnostics.focusRetest.listenerCount": "diagnostics",
  "diagnostics.focusRetestCreatedSubscription": "diagnostics",
  "diagnostics.focusRetestLastSignature": "diagnostics",
  "diagnostics.focusRetestListeners": "diagnostics",
  "diagnostics.focusRetestPollTimer": "diagnostics",
  "diagnostics.lastPlatformCapabilityReport": "diagnostics",
  "diagnostics.mainBridge.fileState": "mainBridgeRouting",
  "diagnostics.mainBridge.lastSnapshotAt": "mainBridgeRouting",
  "diagnostics.mainBridge.state": "mainBridgeRouting",
  "diagnostics.runtimeCompatibility": "diagnostics",
  "http.port": "annotatorHost",
  "http.server": "annotatorHost",
  "http.tokenMap": "annotatorHost",
  "lifecycle.originalPdfViewType": "lifecycle",
  "lifecycle.overrideInstalled": "lifecycle",
  "lifecycle.pdfRuntimeRegistration": "mainBridgeRouting",
  "navigation.activePdfIdentity": "mainBridgeRouting",
  "navigation.lastContextNavigationState": "contextMenu",
  "navigation.lastExistingCategoryCopyArtifactFilter": "annotationIo",
  "navigation.lastInterceptedLink": "linkLocator",
  "navigation.lastKnownPdfFilePath": "linkLocator",
  "navigation.lastLinkLocatorRestore": "linkLocator",
  "navigation.lastNativeSelectionIdentityDiagnostic": "diagnostics",
  "navigation.lastPdfLeafReuse": "linkLocator",
  "navigation.lastPdfLeafReuse.error": "linkLocator",
  "navigation.lastPdfLeafReuse.reused": "linkLocator",
  "navigation.lastResolvedPdfIdentity": "linkLocator",
  "navigation.lastSelectionLinkDiagnostic": "selectionLinks",
  "navigation.pendingPages": "linkLocator",
  "metadata.schema": "metadataSchema",
  "metadata.loaded": "metadataSchema",
  "metadata.lastError": "metadataSchema",
  "metadata.lastBackupPath": "metadataSchema",
  "documentInfo.panelOpen": "documentInfo",
  "documentInfo.editingPdfPath": "documentInfo",
  "documentRecords.ambiguousIds": "documentRecords",
  "documentRecords.ambiguousPdfPaths": "documentRecords",
  "documentRecords.byId": "documentRecords",
  "documentRecords.byPdfPath": "documentRecords",
  "documentRecords.entryByRecordPath": "documentRecords",
  "documentRecords.idsByPdfPath": "documentRecords",
  "documentRecords.initialized": "documentRecords",
  "documentRecords.readyPromise": "documentRecords",
  "documentRecords.warmupIdleHandle": "documentRecords",
  "documentRecords.warmupScheduledAtMs": "documentRecords",
  "documentRecords.warmupScheduleMode": "documentRecords",
  "documentRecords.warmupLayoutReady": "documentRecords",
  "documentRecords.warmupMetadataResolved": "documentRecords",
  "documentRecords.warmupGateOrder": "documentRecords",
  "documentRecords.lastError": "documentRecords",
  "documentRecords.operationQueue": "documentRecords",
  "documentRecords.recordPathsById": "documentRecords",
  "documentRecords.lastBuildMetrics": "documentRecords",
  "documentRecords.benchmarkEventSuppression": "documentRecords"
});

module.exports = { PLUGIN_FEATURE_CONTRACTS, PLUGIN_STATE_DOMAIN_OWNERS, PLUGIN_STATE_FIELD_OWNERS };
