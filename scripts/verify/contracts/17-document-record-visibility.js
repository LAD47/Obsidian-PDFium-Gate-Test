'use strict';
const ctx=require('../context');

module.exports=async function verifyDocumentRecordVisibility(){
  const {path,ROOT,fail,read}=ctx;
  const recordApi=require(path.join(ROOT,'src/metadata/record-contract.js'));
  const featureSource=read('src/plugin/features/17-document-record-visibility.js');
  const lifecycle=read('src/plugin/features/01-lifecycle.js');
  const settings=read('src/main/settings.js');
  const styles=read('styles.css');
  const documentRecords=read('src/plugin/features/16-document-records.js');

  if(recordApi.METADATA_RECORDS_ROOT!=='File Metadata') fail('visibility build changed canonical document-record root');
  if(recordApi.METADATA_RECORDS_ROOT.startsWith('.')) fail('document records moved into a hidden dot-folder');
  if(!featureSource.includes("DOCUMENT_RECORD_VISIBILITY_BODY_CLASS = 'pdfium-hide-document-records'")) fail('visibility body-class contract missing');
  if(!featureSource.includes("DOCUMENT_RECORD_VISIBILITY_SETTING = 'hideDocumentMetadataFilesInExplorer'")) fail('visibility setting contract missing');
  if(!styles.includes('.workspace-leaf-content[data-type="file-explorer"]')) fail('visibility CSS is not scoped to File Explorer');
  if(!styles.includes('.nav-folder:has(> .nav-folder-title[data-path="File Metadata"])')) fail('visibility CSS does not target exact canonical record root');
  if(!styles.includes('display: none !important;')) fail('visibility CSS does not actually hide the File Explorer folder');
  if(!settings.includes("settings.metadata.hideFiles.name")) fail('localized visibility setting UI missing');
  if(!settings.includes("hideDocumentMetadataFilesInExplorer !== false")) fail('visibility setting is not default-on');
  if(!lifecycle.includes("id: 'toggle-document-metadata-files'")) fail('visibility Command Palette entry missing');
  if(!lifecycle.includes('this.ports.applyDocumentRecordVisibility();')) fail('visibility is not applied on plugin load');
  if(!lifecycle.includes('this.ports.clearDocumentRecordVisibility();')) fail('visibility is not cleared on plugin unload');
  for(const forbidden of ['METADATA_RECORDS_ROOT = \' .pdf-metadata\'','moveRecord','renameRecordRoot']) {
    if(featureSource.includes(forbidden)) fail(`presentation owner contains storage mutation marker: ${forbidden}`);
  }
  if(documentRecords.includes('pdfium-hide-document-records')||documentRecords.includes('hideDocumentMetadataFilesInExplorer')) fail('presentation visibility leaked into document-record storage owner');

  const globalKeys=['Notice','PLUGIN_VERSION','document'];
  const previous={};
  for(const key of globalKeys) previous[key]=global[key];
  const notices=[];
  global.Notice=function(message){ notices.push(String(message)); };
  global.PLUGIN_VERSION='0.1.195';
  const classes=new Set();
  global.document={body:{classList:{
    toggle(name,force){ if(force) classes.add(name); else classes.delete(name); return !!force; },
    remove(name){ classes.delete(name); }
  }}};

  const featurePath=path.join(ROOT,'src/plugin/features/17-document-record-visibility.js');
  delete require.cache[require.resolve(featurePath)];
  const {DocumentRecordVisibilityFeature,DOCUMENT_RECORD_VISIBILITY_BODY_CLASS}=require(featurePath);
  const saved=[];
  const owner=new DocumentRecordVisibilityFeature();
  owner.settings={};
  owner.obsidianPluginDataAdapter={saveData:async value=>saved.push({...value})};

  let result=owner.applyDocumentRecordVisibility();
  if(!result.ok||!result.hidden||!classes.has(DOCUMENT_RECORD_VISIBILITY_BODY_CLASS)) fail('default visibility state does not hide File Explorer records');
  result=await owner.setDocumentRecordFolderHidden(false);
  if(!result.ok||result.hidden||classes.has(DOCUMENT_RECORD_VISIBILITY_BODY_CLASS)) fail('visibility setting cannot reveal records');
  if(saved.length!==1||saved[0].hideDocumentMetadataFilesInExplorer!==false) fail('visibility reveal setting was not persisted');
  result=await owner.toggleDocumentRecordVisibility();
  if(!result.ok||!result.hidden||!classes.has(DOCUMENT_RECORD_VISIBILITY_BODY_CLASS)) fail('visibility toggle cannot re-hide records');
  owner.clearDocumentRecordVisibility();
  if(classes.has(DOCUMENT_RECORD_VISIBILITY_BODY_CLASS)) fail('plugin unload visibility cleanup failed');
  if(notices.length!==1) fail('visibility toggle does not provide one user notice');

  for(const key of globalKeys){
    if(previous[key]===undefined) delete global[key]; else global[key]=previous[key];
  }

  return {
    presentationOnly:true,
    canonicalRecordRoot:recordApi.METADATA_RECORDS_ROOT,
    indexedMarkdownRecordsPreserved:true,
    defaultHiddenInFileExplorer:true,
    settingsToggle:true,
    commandPaletteToggle:true,
    unloadFailsOpen:true,
    storageContractUnchanged:true
  };
};
