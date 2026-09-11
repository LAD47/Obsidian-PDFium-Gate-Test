'use strict';

function copyFeaturePrototype(targetClass, featureClass, featureId) {
  const descriptors = Object.getOwnPropertyDescriptors(featureClass.prototype);
  delete descriptors.constructor;
  for (const [name, descriptor] of Object.entries(descriptors)) {
    if (Object.prototype.hasOwnProperty.call(targetClass.prototype, name)) {
      throw new Error(`Duplicate plugin method ${name} while installing feature ${featureId}`);
    }
    Object.defineProperty(targetClass.prototype, name, descriptor);
  }
}

const PLUGIN_FEATURE_CLASSES = Object.freeze({
  lifecycle: LifecycleFeature,
  rendererBridge: RendererBridgeFeature,
  diagnostics: DiagnosticsFeature,
  categoryConfig: CategoryConfigFeature,
  contextMenu: ContextMenuFeature,
  selectionLinks: SelectionLinksFeature,
  mainBridgeRouting: MainBridgeRoutingFeature,
  linkLocator: LinkLocatorFeature,
  annotatorHost: AnnotatorHostFeature,
  selectionBridge: SelectionBridgeFeature,
  annotationIo: AnnotationIoFeature,
  selectionDiagnostics: SelectionDiagnosticsFeature,
  categoryMutation: CategoryMutationFeature,
  metadataSchema: MetadataSchemaFeature,
  documentInfo: DocumentInfoFeature,
  documentRecords: DocumentRecordsFeature,
  documentRecordVisibility: DocumentRecordVisibilityFeature,
  documentRegisterBases: DocumentRegisterBasesFeature,
  metadataBenchmark: MetadataBenchmarkFeature
});

function createBoundPluginPorts(host) {
  const ports = Object.create(null);
  const owners = Object.create(null);
  for (const [featureId, featureClass] of Object.entries(PLUGIN_FEATURE_CLASSES)) {
    for (const name of Object.getOwnPropertyNames(featureClass.prototype)) {
      if (name === 'constructor') continue;
      const descriptor = Object.getOwnPropertyDescriptor(featureClass.prototype, name);
      if (!descriptor || typeof descriptor.value !== 'function') continue;
      if (ports[name]) throw new Error(`Duplicate plugin port provider ${name}: ${owners[name]} / ${featureId}`);
      ports[name] = descriptor.value.bind(host);
      owners[name] = featureId;
    }
  }
  for (const [featureId, contract] of Object.entries(PLUGIN_FEATURE_CONTRACTS)) {
    for (const port of contract.ports || []) {
      if (typeof ports[port] !== 'function') throw new Error(`Unknown plugin port ${featureId} -> ${port}`);
    }
  }
  return Object.freeze(ports);
}

class PdfiumGateTestPlugin extends Plugin {
  constructor(...args) {
    super(...args);
    this.ports = createBoundPluginPorts(this);
  }
}

for (const [featureId, featureClass] of Object.entries(PLUGIN_FEATURE_CLASSES)) {
  copyFeaturePrototype(PdfiumGateTestPlugin, featureClass, featureId);
}

module.exports = PdfiumGateTestPlugin;
