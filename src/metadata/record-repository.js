'use strict';

const METADATA_RECORD_REPOSITORY_CONTRACT_VERSION='0.1';

function createMetadataRecordRepository({vaultReadAdapter,vaultWriteAdapter,frontmatterAdapter,parseYamlFn,recordApi}) {
  if(!vaultReadAdapter || typeof vaultReadAdapter.readText!=='function' || typeof vaultReadAdapter.getAbstractFileByPath!=='function') throw new Error('metadata record repository: vault read adapter incomplete');
  if(!vaultWriteAdapter || typeof vaultWriteAdapter.createText!=='function' || typeof vaultWriteAdapter.ensureFolder!=='function') throw new Error('metadata record repository: vault write adapter incomplete');
  if(!frontmatterAdapter || typeof frontmatterAdapter.processFrontMatter!=='function') throw new Error('metadata record repository: frontmatter adapter incomplete');
  if(typeof parseYamlFn!=='function') throw new Error('metadata record repository: parseYaml function missing');
  if(!recordApi) throw new Error('metadata record repository: record contract missing');

  function parseMarkdown(text,schema) {
    const source=String(text || '');
    const match=/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source);
    if(!match) return {ok:false,error:'metadata record mangler YAML frontmatter'};
    let frontmatter;
    try { frontmatter=parseYamlFn(match[1]); }
    catch(error) { return {ok:false,error:`ugyldig YAML: ${error instanceof Error?error.message:String(error)}`}; }
    return recordApi.metadataRecordFromFrontmatter(frontmatter,schema);
  }

  async function readRecordFile(file,schema) {
    if(!file) return {ok:false,error:'metadata record file mangler'};
    const text=await vaultReadAdapter.readText(file);
    const parsed=parseMarkdown(text,schema);
    return parsed.ok ? {...parsed,file,recordPath:String(file.path || '')} : {...parsed,file,recordPath:String(file.path || '')};
  }

  async function verifyRecordPath(recordPath,expectedId,schema) {
    const file=vaultReadAdapter.getAbstractFileByPath(recordPath);
    if(!file || String(file.extension || '').toLowerCase()!=='md') throw new Error(`metadata record write verification failed: ${recordPath} mangler`);
    const readBack=await readRecordFile(file,schema);
    if(!readBack.ok) throw new Error(`metadata record write verification failed: ${readBack.error}`);
    if(readBack.record.id!==expectedId) throw new Error('metadata record write verification failed: pdfmeta_id mismatch');
    return readBack;
  }

  async function createRecord(record,schema) {
    const recordPath=recordApi.metadataRecordPathFromId(record.id);
    const parts=recordPath.split('/');
    const shardFolder=parts.slice(0,-1).join('/');
    await vaultWriteAdapter.ensureFolder(recordApi.METADATA_RECORDS_ROOT);
    await vaultWriteAdapter.ensureFolder(shardFolder);
    if(vaultReadAdapter.getAbstractFileByPath(recordPath)) throw new Error(`metadata record finnes allerede: ${recordPath}`);
    const markdown=recordApi.metadataRecordSerializeMarkdown(record,schema);
    const file=await vaultWriteAdapter.createText(recordPath,markdown);
    return await verifyRecordPath(recordPath,record.id,schema);
  }

  async function updateRecord(file,record,schema) {
    if(!file) throw new Error('metadata record update mangler fil');
    const fieldProperties=new Set(Array.isArray(schema?.fields)?schema.fields.map(field=>field.property):[]);
    await frontmatterAdapter.processFrontMatter(file,frontmatter=>{
      frontmatter.pdfmeta_type=recordApi.METADATA_RECORD_TYPE;
      frontmatter.pdfmeta_version=recordApi.METADATA_RECORD_FORMAT_VERSION;
      frontmatter.pdfmeta_id=String(record.id).toLowerCase();
      frontmatter.pdfmeta_file=recordApi.metadataRecordPdfLink(record.pdfPath);
      frontmatter.pdfmeta_status=record.status;
      const values=record.values && typeof record.values==='object' && !Array.isArray(record.values) ? record.values : {};
      for(const property of fieldProperties) {
        if(Object.prototype.hasOwnProperty.call(values,property) && !recordApi.metadataRecordIsEmptyUserValue(values[property])) frontmatter[property]=recordApi.metadataRecordClone(values[property]);
        else delete frontmatter[property];
      }
    });
    return await verifyRecordPath(String(file.path || ''),record.id,schema);
  }

  return Object.freeze({
    contractVersion:METADATA_RECORD_REPOSITORY_CONTRACT_VERSION,
    parseMarkdown,
    readRecordFile,
    createRecord,
    updateRecord,
    verifyRecordPath
  });
}

module.exports={METADATA_RECORD_REPOSITORY_CONTRACT_VERSION,createMetadataRecordRepository};
