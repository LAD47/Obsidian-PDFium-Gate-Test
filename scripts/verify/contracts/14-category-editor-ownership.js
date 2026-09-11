'use strict';
const vm = require('vm');
const {read,fail}=require('../context');

module.exports=async function verifyCategoryEditorOwnership(){
  const nearestId='11111111-1111-4111-8111-111111111111';
  const rootOwnedId='22222222-2222-4222-8222-222222222222';
  const economyId='a49dde44-7872-4d89-b97e-027a6e689d94';
  const factId='c44c3b4a-110a-4446-a7e9-e3662e1dc791';

  const foundation=read('src/core/pdf-link-category-foundation.js');
  const foundationSandbox={module:{exports:{}},exports:{},crypto:{randomUUID:()=> '33333333-3333-4333-8333-333333333333'}};
  vm.runInNewContext(foundation+'\nmodule.exports={categoryUuidV4,categoryIsUuidV4,DEFAULT_CATEGORIES,createDefaultCategories};',foundationSandbox,{filename:'pdf-link-category-foundation.js'});
  const ids=foundationSandbox.module.exports.DEFAULT_CATEGORIES.map(c=>String(c.id||''));
  if(ids.length!==5||new Set(ids).size!==5||ids.some(id=>!foundationSandbox.module.exports.categoryIsUuidV4(id))) fail('factory category IDs are not unique UUID v4 values');
  if(foundationSandbox.module.exports.categoryUuidV4()!=='33333333-3333-4333-8333-333333333333') fail('category UUID generator does not use canonical randomUUID source');
  if(foundationSandbox.module.exports.categoryIsUuidV4('economy')) fail('legacy semantic category ID is still accepted as canonical UUID');
  const canonicalNames=foundationSandbox.module.exports.createDefaultCategories().map(c=>String(c.name||''));
  if(JSON.stringify(canonicalNames)!==JSON.stringify(['Economy','Regulation','Fact','Documentation','Investigate'])) fail('canonical English factory category names drifted');
  const ignoredLanguageArgument=foundationSandbox.module.exports.createDefaultCategories(()=> 'SHOULD NOT BE USED');
  if(JSON.stringify(ignoredLanguageArgument.map(c=>c.name))!==JSON.stringify(canonicalNames)) fail('category factory defaults unexpectedly depend on UI language');
  if(JSON.stringify(ignoredLanguageArgument.map(c=>c.id))!==JSON.stringify(ids)) fail('category factory changed stable category IDs');


  const source=read('src/plugin/features/04-category-config.js');
  const sandbox={module:{exports:{}},exports:{},deepClone:value=>value==null?value:JSON.parse(JSON.stringify(value))};
  vm.runInNewContext(source,sandbox,{filename:'04-category-config.js'});
  const Feature=sandbox.module.exports.CategoryConfigFeature;
  if(typeof Feature!=='function') fail('CategoryConfigFeature export missing');
  const p=new Feature();
  const enLocale=JSON.parse(read('src/i18n/en.json'));
  const testI18n={t:(key,params={})=>String(enLocale[key]||key).replace(/\{\{([a-zA-Z0-9_]+)\}\}/g,(_m,k)=>Object.prototype.hasOwnProperty.call(params,k)?String(params[k]):`{{${k}}}`)};
  p.i18n=testI18n;
  p.configPathForFolder=folder=>`${folder?folder+'/':''}.pdf-metadata/highlight-categories.yaml`;

  const info={
    effective:{categories:[
      {id:nearestId,name:'Nearest',color:'#111111'},
      {id:rootOwnedId,name:'Root owned',color:'#222222'}
    ]},
    chainLeafFirst:[
      {
        folder:'Cases/Oslo',
        configPath:'Cases/Oslo/.pdf-metadata/highlight-categories.yaml',
        config:{categories:[{id:nearestId,shortcut:2}]}
      },
      {
        folder:'Cases',
        configPath:'Cases/.pdf-metadata/highlight-categories.yaml',
        config:{categories:[{id:nearestId,color:'#AAAAAA'}]}
      },
      {
        folder:'',
        configPath:'.pdf-metadata/highlight-categories.yaml',
        config:{categories:[{id:rootOwnedId,name:'Root owned'}]}
      }
    ]
  };

  const nearest=p.categorySourceForResolvedInfo(info,nearestId);
  if(!nearest||nearest.folder!=='Cases/Oslo'||nearest.editable!==true) fail('inherited category source did not resolve to nearest owning ancestor');
  const root=p.categorySourceForResolvedInfo(info,rootOwnedId);
  if(!root||root.folder!==''||root.sourceLabel!==enLocale['common.vaultRoot']||root.configPath!=='.pdf-metadata/highlight-categories.yaml'||root.editable!==true) fail('vault-root category owner provenance failed');
  const unknown=p.categorySourceForResolvedInfo(info,'33333333-3333-4333-8333-333333333333');
  if(unknown!==null) fail('category provenance guessed an owner that does not exist');
  const map=p.categorySourceMapForResolvedInfo(info);
  if(Object.keys(map).length!==2||map[nearestId].folder!=='Cases/Oslo'||map[rootOwnedId].folder!=='') fail('per-category provenance map failed');

  // Exercise the real resolver: runtime categories must come from physical files only and UUID identity must survive overrides.
  const resolverSandbox={module:{exports:{}},exports:{}};
  vm.runInNewContext(foundation+'\n'+source,resolverSandbox,{filename:'category-resolver-combined.js'});
  const ResolverFeature=resolverSandbox.module.exports.CategoryConfigFeature;
  const resolver=new ResolverFeature();
  resolver.i18n=testI18n;
  resolver.readFolderCategoryConfig=folder=>{
    if(folder==='Cases/Oslo') return {exists:false,configPath:'Cases/Oslo/.pdf-metadata/highlight-categories.yaml'};
    if(folder==='Cases') return {exists:true,configPath:'Cases/.pdf-metadata/highlight-categories.yaml',config:{version:1,inherit:true,categories:[{id:economyId,name:'Lokal økonomi',color:'#ABCDEF',enabled:true}]}};
    if(folder==='') return {exists:true,configPath:'.pdf-metadata/highlight-categories.yaml',config:{version:1,inherit:false,categories:[{id:economyId,name:'Økonomi',color:'#FFD84D',enabled:true},{id:factId,name:'Faktum',color:'#72C472',enabled:true}]}};
    return {exists:false,configPath:`${folder}/.pdf-metadata/highlight-categories.yaml`};
  };
  const resolved=resolver.resolveCategoryConfigForFolder('Cases/Oslo');
  if(resolved.effective.categories.length!==2) fail('physical category resolver produced unexpected category count');
  if(resolved.effective.categories.find(c=>c.id===economyId)?.name!=='Lokal økonomi') fail('nearest physical category override did not win');
  if(resolved.sources.some(item=>item.builtIn||String(item.configPath||'').includes('innebygde'))) fail('runtime resolver still reports built-in provenance');
  let legacyIdBlocked=false;
  try{ resolver.validateEffectiveCategories([{id:'economy',name:'Legacy',color:'#FFD84D'}],'legacy-id'); }catch(error){ legacyIdBlocked=/UUID v4/.test(String(error?.message||error)); }
  if(!legacyIdBlocked) fail('legacy mutable/semantic category ID is not rejected by UUID contract');
  resolver.readFolderCategoryConfig=folder=>({exists:false,configPath:`${folder?folder+'/':''}.pdf-metadata/highlight-categories.yaml`});
  let rootMissingBlocked=false;
  try{resolver.resolveCategoryConfigForFolder('Cases/Oslo');}catch(error){rootMissingBlocked=/global category configuration is missing/.test(String(error?.message||error));}
  if(!rootMissingBlocked) fail('runtime resolver did not fail closed when physical root owner was missing');

  let createCalls=0;
  p.readFolderCategoryConfig=()=>({exists:false,configPath:'.pdf-metadata/highlight-categories.yaml'});
  p.createDefaultCategoryConfig=async(folder,options)=>{createCalls++; return {created:true,folder,inherit:options?.inherit};};
  const created=await p.ensureRootCategoryConfigInitialized();
  if(createCalls!==1||created.folder!==''||created.inherit!==false) fail('missing root category config is not bootstrapped from factory defaults');

  let normalizeCalls=0;
  p.readFolderCategoryConfig=()=>({exists:true,configPath:'.pdf-metadata/highlight-categories.yaml',config:{version:1,inherit:true,categories:[{id:rootOwnedId,name:'Root',color:'#AABBCC'}]}});
  p.saveFolderCategoryConfig=async(folder,config)=>{normalizeCalls++; if(folder!==''||config.inherit!==false) fail('existing root category config was not normalized to root ownership'); return {backupPath:'backup.yaml'};};
  const normalized=await p.ensureRootCategoryConfigInitialized();
  if(normalizeCalls!==1||normalized.normalized!==true) fail('existing root category config normalization missing');

  const modal=read('src/main/category-modals.js');
  const lifecycle=read('src/plugin/features/01-lifecycle.js');
  for(const required of [
    'inheritedCategorySources',
    "category.inherited.editParentName",
    "category.inherited.editParent",
    'editInheritedCategoryAtOwner(cat)',
    "category.source.inheritedFrom",
    "category.editor.addLocal",
    "category.editor.addGlobal",
    'categoryUuidV4()',
    "category.advanced.idDesc",
    "t.inputEl.readOnly = true",
    "category.advanced.copyId"
  ]) if(!modal.includes(required)) fail(`category editor owner/UUID/create UI missing: ${required}`);
  if(modal.includes("cat.id = String(v).trim()")) fail('category ID remains user-editable in the editor');
  if(modal.includes('`category-${n}`')) fail('legacy sequential category ID generation remains');
  if(modal.includes('Rediger global standard…')||modal.includes('Edit global standard…')) fail('obsolete built-in global-standard editing path remains');
  if(source.includes('ensureBuiltInCategoryEditableAtRoot')) fail('obsolete built-in category materialization owner remains');
  if(source.includes("configPath: '(innebygde standarder)'")) fail('built-in defaults remain a runtime provenance source');
  if(!source.includes('categories: cleanFolder && inherit ? [] : createDefaultCategories()')) fail('local config bootstrap does not use canonical English factory defaults while keeping inherited local config empty');
  if(!lifecycle.includes('await this.ports.ensureRootCategoryConfigInitialized();')) fail('root category bootstrap is not part of plugin startup');
  if(!modal.includes("addLocalButton.addEventListener('click', () => this.addCategory())")) fail('level create action is not wired to canonical addCategory');
  if(!modal.includes(".setName(createLabel)")) fail('category detail page does not expose create-on-current-level action');

  return {
    perCategoryOwnerProvenance:true,
    nearestOwningAncestorWins:true,
    vaultRootOwnerEditable:true,
    factoryDefaultsBootstrapOnly:true,
    physicalRootOwnerRequired:true,
    directOwnerNavigation:true,
    inheritedRowActionVisible:true,
    firstLocalCategoryDiscoverable:true,
    createAtCurrentOwnerLevelVisible:true,
    permanentUuidCategoryIds:true,
    categoryIdReadOnly:true,
    visualEditorStructurePreserved:true
  };
};
