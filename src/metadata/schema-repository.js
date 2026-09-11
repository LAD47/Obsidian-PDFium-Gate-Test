'use strict';

const METADATA_SCHEMA_REPOSITORY_CONTRACT_VERSION = '0.3';

function createMetadataSchemaRepository({
  fileStore,
  schemaApi = (typeof metadataSchemaContract !== 'undefined' ? metadataSchemaContract : null),
  safeWriteApi = (typeof safeConfigFileWriteContract !== 'undefined' ? safeConfigFileWriteContract : null)
}) {
  if (!schemaApi) throw new Error('metadata schema repository: schema contract missing');
  if (!safeWriteApi) throw new Error('metadata schema repository: safe config writer missing');
  const {
    METADATA_SCHEMA_ROOT,
    METADATA_SCHEMA_FILE_NAME,
    METADATA_SCHEMA_PATH,
    METADATA_SCHEMA_BACKUP_ROOT,
    metadataValidateSchema,
    metadataClone,
    metadataDefaultSchema
  } = schemaApi;
  const { safeWriteConfigText } = safeWriteApi;

  if (!fileStore || typeof fileStore.exists !== 'function' || typeof fileStore.readText !== 'function' || typeof fileStore.writeText !== 'function' || typeof fileStore.ensureFolder !== 'function' || typeof fileStore.rename !== 'function' || typeof fileStore.removeFile !== 'function') {
    throw new Error('metadata schema repository: adapter file store incomplete');
  }

  function parseAndValidateSchemaText(text, context) {
    let schema;
    try { schema = JSON.parse(String(text || '')); }
    catch (error) { throw new Error(`Ugyldig JSON i ${context}: ${error instanceof Error ? error.message : String(error)}`); }
    const validation = metadataValidateSchema(schema);
    if (!validation.ok) throw new Error(`Ugyldig metadata-skjema:\n${validation.errors.join('\n')}`);
    return schema;
  }

  async function readSchema() {
    if (!(await fileStore.exists(METADATA_SCHEMA_PATH))) return { exists:false, schema:null, path:METADATA_SCHEMA_PATH };
    const text = await fileStore.readText(METADATA_SCHEMA_PATH);
    const schema = parseAndValidateSchemaText(text, METADATA_SCHEMA_PATH);
    return { exists:true, schema, path:METADATA_SCHEMA_PATH };
  }

  async function writeSchema(schema) {
    const validation = metadataValidateSchema(schema);
    if (!validation.ok) throw new Error(`Kan ikke lagre ugyldig metadata-skjema:\n${validation.errors.join('\n')}`);
    const text = `${JSON.stringify(schema, null, 2)}\n`;
    const writeResult = await safeWriteConfigText({
      store:fileStore,
      targetPath:METADATA_SCHEMA_PATH,
      backupDir:METADATA_SCHEMA_BACKUP_ROOT,
      backupStem:METADATA_SCHEMA_FILE_NAME.replace(/\.json$/i, ''),
      backupExtension:'json',
      text,
      validateText:async candidateText => { parseAndValidateSchemaText(candidateText, METADATA_SCHEMA_PATH); }
    });

    if (!(await fileStore.exists(METADATA_SCHEMA_PATH))) throw new Error(`Schema write verification failed: ${METADATA_SCHEMA_PATH} mangler etter lagring`);
    const verifyText = await fileStore.readText(METADATA_SCHEMA_PATH);
    const verify = parseAndValidateSchemaText(verifyText, METADATA_SCHEMA_PATH);
    return {
      schema:metadataClone(verify),
      changed:writeResult.changed === true,
      created:writeResult.created === true,
      path:METADATA_SCHEMA_PATH,
      backupPath:writeResult.backupPath || null
    };
  }

  async function loadOrCreateDefault() {
    const current = await readSchema();
    if (current.exists) return { schema:metadataClone(current.schema), created:false, backupPath:null };
    await fileStore.ensureFolder(METADATA_SCHEMA_ROOT);
    const result = await writeSchema(metadataDefaultSchema());
    return { schema:metadataClone(result.schema), created:true, backupPath:null };
  }

  return Object.freeze({ contractVersion:METADATA_SCHEMA_REPOSITORY_CONTRACT_VERSION, readSchema, writeSchema, loadOrCreateDefault });
}

module.exports = { METADATA_SCHEMA_REPOSITORY_CONTRACT_VERSION, createMetadataSchemaRepository };
