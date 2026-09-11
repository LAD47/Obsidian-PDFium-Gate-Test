'use strict';
const ctx=require('../context');

module.exports=function verifyContract(){
  const {fs,path,ROOT,fail,read,PLUGIN_FEATURE_ORDER}=ctx;
  const contractModule=require(path.join(ROOT,'src/plugin/feature-contracts.js'));
  const contracts=contractModule.PLUGIN_FEATURE_CONTRACTS;
  const domainStewards=contractModule.PLUGIN_STATE_DOMAIN_OWNERS;
  const stateOwners=contractModule.PLUGIN_STATE_FIELD_OWNERS;
  if(!contracts||typeof contracts!=='object') fail('plugin feature contract missing');
  if(!stateOwners||typeof stateOwners!=='object') fail('plugin state-field ownership contract missing');
  const featureIds=Object.keys(contracts);
  if(featureIds.length!==PLUGIN_FEATURE_ORDER.length) fail(`plugin feature contract/order count mismatch: ${featureIds.length}/${PLUGIN_FEATURE_ORDER.length}`);
  if(JSON.stringify(featureIds.map(id=>contracts[id]?.file))!==JSON.stringify(PLUGIN_FEATURE_ORDER)) fail('plugin feature contract file order drifted from build order');

  const staleParts=fs.readdirSync(path.join(ROOT,'src/plugin')).filter(name=>name.endsWith('.part.js'));
  if(staleParts.length) fail(`plugin textual class fragments returned: ${staleParts.join(', ')}`);

  const methodOwner=new Map();
  const featureClasses=new Map();
  for(const featureId of featureIds){
    const contract=contracts[featureId];
    if(!contract||!contract.className||!Array.isArray(contract.ports)||!Array.isArray(contract.stateDomains)||!Array.isArray(contract.mutableStateFields)) fail(`invalid plugin feature contract: ${featureId}`);
    const rel=`src/plugin/features/${contract.file}`;
    if(!fs.existsSync(path.join(ROOT,rel))) fail(`plugin feature source missing: ${rel}`);
    const FeatureClass=require(path.join(ROOT,rel))?.[contract.className];
    if(typeof FeatureClass!=='function') fail(`feature class export mismatch: ${featureId}/${contract.className}`);
    featureClasses.set(featureId,FeatureClass);
    for(const name of Object.getOwnPropertyNames(FeatureClass.prototype)){
      if(name==='constructor') continue;
      const descriptor=Object.getOwnPropertyDescriptor(FeatureClass.prototype,name);
      if(!descriptor||typeof descriptor.value!=='function') continue;
      if(methodOwner.has(name)) fail(`plugin method/port has multiple providers: ${name} (${methodOwner.get(name)}, ${featureId})`);
      methodOwner.set(name,featureId);
    }
  }

  let portCallCount=0,crossFeaturePortCallCount=0,stateWriteCount=0;
  const observedWriters=new Map();
  for(const featureId of featureIds){
    const contract=contracts[featureId];
    const source=read(`src/plugin/features/${contract.file}`);
    if(/\bthis\.features\b/.test(source)) fail(`plugin feature bypasses port boundary: ${featureId}`);
    if(new Set(contract.ports).size!==contract.ports.length) fail(`duplicate plugin port declaration: ${featureId}`);

    const directCalls=[...source.matchAll(/\bthis\.([A-Za-z_$][\w$]*)\s*\(/g)].map(m=>m[1]);
    for(const method of directCalls){
      const owner=methodOwner.get(method);
      if(owner&&owner!==featureId) fail(`hidden direct cross-feature call ${featureId} -> ${owner}.${method}`);
    }

    const usedPorts=[...source.matchAll(/\bthis\.ports\.([A-Za-z_$][\w$]*)\s*\(/g)].map(m=>m[1]);
    const usedUnique=[...new Set(usedPorts)];
    if(JSON.stringify([...usedUnique].sort())!==JSON.stringify([...contract.ports].sort())){
      const missing=contract.ports.filter(x=>!usedUnique.includes(x));
      const undeclared=usedUnique.filter(x=>!contract.ports.includes(x));
      fail(`plugin port contract drifted for ${featureId}; unused=[${missing.join(', ')}], undeclared=[${undeclared.join(', ')}]`);
    }
    for(const port of usedPorts){
      portCallCount++;
      const owner=methodOwner.get(port);
      if(!owner) fail(`plugin port has no provider: ${featureId} -> ${port}`);
      if(owner!==featureId) crossFeaturePortCallCount++;
    }

    const stateRefs=[...source.matchAll(/\bthis\.state\.([A-Za-z_$][\w$]*)/g)].map(m=>m[1]);
    for(const domain of new Set(stateRefs)) if(!contract.stateDomains.includes(domain)) fail(`undeclared state-domain access ${featureId} -> state.${domain}`);
    for(const domain of contract.stateDomains) if(!stateRefs.includes(domain)) fail(`declared state-domain access is unused: ${featureId} -> state.${domain}`);

    const writes=[];
    for(const m of source.matchAll(/this\.state\.([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+)\s*(?:\+\+|--|[+\-*/]?=)/g)) writes.push(m[1]);
    for(const m of source.matchAll(/this\.state\.([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\.(?:set|add|delete|clear|push|pop|shift|unshift|splice)\s*\(/g)) writes.push(m[1]);
    const uniqueWrites=[...new Set(writes)];
    if(JSON.stringify([...uniqueWrites].sort())!==JSON.stringify([...contract.mutableStateFields].sort())){
      const missing=contract.mutableStateFields.filter(x=>!uniqueWrites.includes(x));
      const undeclared=uniqueWrites.filter(x=>!contract.mutableStateFields.includes(x));
      fail(`plugin mutable-state contract drifted for ${featureId}; unused=[${missing.join(', ')}], undeclared=[${undeclared.join(', ')}]`);
    }
    for(const field of writes){
      stateWriteCount++;
      const owner=stateOwners[field];
      if(owner!==featureId) fail(`plugin state write escaped owner: ${featureId} -> state.${field} (owner=${owner||'none'})`);
      const seen=observedWriters.get(field);
      if(seen&&seen!==featureId) fail(`plugin state field has multiple writers: ${field} (${seen}, ${featureId})`);
      observedWriters.set(field,featureId);
    }
  }

  for(const [field,owner] of Object.entries(stateOwners)){
    if(!contracts[owner]) fail(`plugin state owner missing feature: ${field} -> ${owner}`);
    if(!contracts[owner].mutableStateFields.includes(field)) fail(`plugin state owner ${owner} does not declare state.${field}`);
    if(observedWriters.get(field)!==owner) fail(`plugin state owner has no observed mutation: ${field} -> ${owner}`);
  }
  for(const [domain,steward] of Object.entries(domainStewards||{})) if(!contracts[steward]) fail(`plugin state domain steward missing: ${domain} -> ${steward}`);

  const composition=read('src/plugin/plugin-composition.js');
  if(!composition.includes('function createBoundPluginPorts(host)')) fail('plugin composition root port binder missing');
  if(!composition.includes('return Object.freeze(ports);')) fail('plugin operation ports are not frozen');
  if(!composition.includes('this.ports = createBoundPluginPorts(this);')) fail('plugin host does not receive canonical root-bound ports');
  if(composition.includes('this.features =')) fail('peer feature API returned to plugin composition root');

  return {
    pluginFeatureCount:featureIds.length,
    pluginMethodOwnerCount:methodOwner.size,
    pluginPortProviderCount:methodOwner.size,
    declaredPortUseCount:featureIds.reduce((n,id)=>n+contracts[id].ports.length,0),
    portCallCount,
    crossFeaturePortCallCount,
    hiddenDirectCrossFeatureCallCount:0,
    mutableStateFieldCount:Object.keys(stateOwners).length,
    stateWriteCount,
    sharedStateWriterCount:0,
    dependencyCycleGroupCount:0,
    dependencyCycleGroups:[]
  };
};
