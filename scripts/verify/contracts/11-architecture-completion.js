'use strict';
const ctx=require('../context');

module.exports=function verifyContract(){
  const plugin=require('./08-plugin-module-boundaries')();
  const mainBridge=require('./09-main-bridge-module-boundaries')();
  const annotator=require('./10-annotator-module-boundaries')();
  const {fail}=ctx;

  if(plugin.hiddenDirectCrossFeatureCallCount!==0||mainBridge.hiddenDirectCrossFeatureCallCount!==0) fail('architecture completion: hidden cross-feature calls remain');
  if(plugin.sharedStateWriterCount!==0||mainBridge.sharedStateWriterCount!==0) fail('architecture completion: shared mutable state writers remain');
  if(plugin.dependencyCycleGroupCount!==0||mainBridge.dependencyCycleGroupCount!==0) fail('architecture completion: feature dependency cycles remain');
  if(plugin.pluginPortProviderCount!==plugin.pluginMethodOwnerCount) fail('architecture completion: plugin port/provider ownership mismatch');
  if(mainBridge.mainBridgePortProviderCount!==mainBridge.mainBridgeMethodOwnerCount) fail('architecture completion: Main Bridge port/provider ownership mismatch');
  if(annotator.hiddenCrossHandlerCallCount!==0||annotator.transportListenerOwnerCount!==1) fail('architecture completion: annotator ownership/transport boundary drifted');
  if(annotator.keyboardAlgorithmModuleCount!==3||annotator.maxAnnotatorHandlerLines>900) fail('architecture completion: keyboard-selection remains structurally monolithic');

  return {
    goal:'architecture-target-achieved',
    plugin:{features:plugin.pluginFeatureCount,mutableStateFields:plugin.mutableStateFieldCount,sharedWriters:plugin.sharedStateWriterCount,dependencyCycles:plugin.dependencyCycleGroupCount},
    mainBridge:{features:mainBridge.mainBridgeFeatureCount,stateFields:mainBridge.stateFieldCount,sharedWriters:mainBridge.sharedStateWriterCount,dependencyCycles:mainBridge.dependencyCycleGroupCount},
    annotator:{handlers:annotator.annotatorHandlerCount,keyboardAlgorithmModules:annotator.keyboardAlgorithmModuleCount,maxHandlerLines:annotator.maxAnnotatorHandlerLines}
  };
};
