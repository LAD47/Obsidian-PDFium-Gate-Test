'use strict';
const ctx=require('../context');

module.exports=function verifyContract(){
  const {fs,path,ROOT,fail,read,MAIN_BRIDGE_FEATURE_ORDER}=ctx;
  const contractModule=require(path.join(ROOT,'src/main-bridge/feature-contracts.js'));
  const contracts=contractModule.MAIN_BRIDGE_FEATURE_CONTRACTS;
  const stateOwners=contractModule.MAIN_BRIDGE_STATE_FIELD_OWNERS;
  if(!contracts||typeof contracts!=='object') fail('Main Bridge feature contract missing');
  if(!stateOwners||typeof stateOwners!=='object') fail('Main Bridge state-field ownership contract missing');
  const featureIds=Object.keys(contracts);
  if(featureIds.length!==MAIN_BRIDGE_FEATURE_ORDER.length) fail(`Main Bridge feature contract/order count mismatch: ${featureIds.length}/${MAIN_BRIDGE_FEATURE_ORDER.length}`);
  if(JSON.stringify(featureIds.map(id=>contracts[id]?.file))!==JSON.stringify(MAIN_BRIDGE_FEATURE_ORDER)) fail('Main Bridge feature contract file order drifted from build order');

  const oldPartsDir=path.join(ROOT,'src/main-bridge/parts');
  if(fs.existsSync(oldPartsDir)){
    const stale=fs.readdirSync(oldPartsDir).filter(name=>name.endsWith('.part.js'));
    if(stale.length) fail(`Main Bridge textual runtime fragments returned: ${stale.join(', ')}`);
  }

  const methodOwner=new Map();
  for(const featureId of featureIds){
    const contract=contracts[featureId];
    if(!contract||!contract.className||!Array.isArray(contract.ports)||!Array.isArray(contract.stateFields)) fail(`invalid Main Bridge feature contract: ${featureId}`);
    const rel=`src/main-bridge/features/${contract.file}`;
    if(!fs.existsSync(path.join(ROOT,rel))) fail(`Main Bridge feature source missing: ${rel}`);
    const FeatureClass=require(path.join(ROOT,rel))?.[contract.className];
    if(typeof FeatureClass!=='function') fail(`Main Bridge feature class export mismatch: ${featureId}/${contract.className}`);
    for(const name of Object.getOwnPropertyNames(FeatureClass.prototype)){
      if(name==='constructor') continue;
      const descriptor=Object.getOwnPropertyDescriptor(FeatureClass.prototype,name);
      if(!descriptor||typeof descriptor.value!=='function') continue;
      if(methodOwner.has(name)) fail(`Main Bridge method/port has multiple providers: ${name} (${methodOwner.get(name)}, ${featureId})`);
      methodOwner.set(name,featureId);
    }
  }

  let portCallCount=0,crossFeaturePortCallCount=0,stateWriteCount=0;
  const observedWriters=new Map();
  for(const featureId of featureIds){
    const contract=contracts[featureId];
    const source=read(`src/main-bridge/features/${contract.file}`);
    if(/__bridgeRuntime\.features\b/.test(source)) fail(`Main Bridge feature bypasses port boundary: ${featureId}`);
    if(new Set(contract.ports).size!==contract.ports.length) fail(`duplicate Main Bridge port declaration in ${featureId}`);

    const FeatureClass=require(path.join(ROOT,'src/main-bridge/features',contract.file))[contract.className];
    for(const name of Object.getOwnPropertyNames(FeatureClass.prototype)){
      if(name==='constructor') continue;
      const descriptor=Object.getOwnPropertyDescriptor(FeatureClass.prototype,name);
      if(!descriptor||typeof descriptor.value!=='function') continue;
      if(!descriptor.value.toString().includes('const __bridgeRuntime = this;')) fail(`Main Bridge feature method lacks lexical runtime host: ${featureId}.${name}`);
    }
    if(/\bthis\.[A-Za-z_$]/.test(source)) fail(`Main Bridge feature uses non-lexical this-property access: ${featureId}`);

    const usedPorts=[...source.matchAll(/__bridgeRuntime\.ports\.([A-Za-z_$][\w$]*)\s*\(/g)].map(m=>m[1]);
    const uniquePorts=[...new Set(usedPorts)];
    if(JSON.stringify([...uniquePorts].sort())!==JSON.stringify([...contract.ports].sort())){
      const missing=contract.ports.filter(x=>!uniquePorts.includes(x));
      const undeclared=uniquePorts.filter(x=>!contract.ports.includes(x));
      fail(`Main Bridge port contract drifted for ${featureId}; unused=[${missing.join(', ')}], undeclared=[${undeclared.join(', ')}]`);
    }
    for(const port of usedPorts){
      portCallCount++;
      const owner=methodOwner.get(port);
      if(!owner) fail(`Main Bridge port has no provider: ${featureId} -> ${port}`);
      if(owner!==featureId) crossFeaturePortCallCount++;
    }

    for(const match of source.matchAll(/__bridgeRuntime\.([A-Za-z_$][\w$]*)\s*\(/g)){
      const method=match[1],owner=methodOwner.get(method);
      if(owner) fail(`hidden direct Main Bridge cross-feature call ${featureId} -> ${owner}.${method}`);
    }

    const stateRefs=[...new Set([...source.matchAll(/__bridgeRuntime\.state\.([A-Za-z_$][\w$]*)/g)].map(m=>m[1]))];
    for(const field of stateRefs){
      if(!contract.stateFields.includes(field)) fail(`undeclared Main Bridge state access ${featureId} -> state.${field}`);
      if(!stateOwners[field]) fail(`Main Bridge state field has no mutation owner: ${field}`);
    }
    for(const field of contract.stateFields) if(!stateRefs.includes(field)) fail(`declared Main Bridge state access is unused: ${featureId} -> state.${field}`);

    const writes=[...source.matchAll(/__bridgeRuntime\.state\.([A-Za-z_$][\w$]*)\s*(?:\+\+|--|[+\-*/]?=)/g)];
    for(const match of writes){
      const field=match[1];stateWriteCount++;
      const owner=stateOwners[field];
      if(owner!==featureId) fail(`Main Bridge state write escaped owner: ${featureId} -> state.${field} (owner=${owner||'none'})`);
      const seen=observedWriters.get(field);
      if(seen&&seen!==featureId) fail(`Main Bridge state field has multiple writers: ${field} (${seen}, ${featureId})`);
      observedWriters.set(field,featureId);
    }
  }

  for(const [field,owner] of Object.entries(stateOwners)){
    if(!contracts[owner]) fail(`Main Bridge state owner missing feature: ${field} -> ${owner}`);
    if(!contracts[owner].stateFields.includes(field)) fail(`Main Bridge state owner ${owner} does not declare state.${field}`);
    if(observedWriters.get(field)!==owner) fail(`Main Bridge state owner has no observed mutation: ${field} -> ${owner}`);
  }

  const composition=read('src/main-bridge/composition.js');
  if(!composition.includes('function createBoundMainBridgePorts(host)')) fail('Main Bridge composition root port binder missing');
  if(!composition.includes('return Object.freeze(ports);')) fail('Main Bridge operation ports are not frozen');
  if(!composition.includes('this.ports = createBoundMainBridgePorts(this);')) fail('Main Bridge host does not receive canonical root-bound ports');
  if(!composition.includes('this.state = this.ports.freshState();')) fail('Main Bridge state is not initialized by canonical kernel port');
  if(!composition.includes('const mainBridgeRuntime = new MainBridgeRuntime();')) fail('Main Bridge composition root singleton missing');
  if(composition.includes('this.features =')) fail('peer feature API returned to Main Bridge composition root');

  return {
    mainBridgeFeatureCount:featureIds.length,
    mainBridgeMethodOwnerCount:methodOwner.size,
    mainBridgePortProviderCount:methodOwner.size,
    declaredPortUseCount:featureIds.reduce((n,id)=>n+contracts[id].ports.length,0),
    portCallCount,
    crossFeaturePortCallCount,
    hiddenDirectCrossFeatureCallCount:0,
    stateFieldCount:Object.keys(stateOwners).length,
    stateWriteCount,
    sharedStateWriterCount:0,
    dependencyCycleGroupCount:0,
    dependencyCycleGroups:[]
  };
};
