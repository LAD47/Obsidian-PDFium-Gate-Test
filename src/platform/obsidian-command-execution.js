'use strict';

// PDFium Gate Platform Contract — renderer-side exact Obsidian command execution.
// The caller supplies one explicit command id. No alias, focused-view, keyboard,
// or alternate-command fallback is performed here.
const OBSIDIAN_COMMAND_EXECUTION_CONTRACT_VERSION = '0.1';

function createObsidianCommandExecutionAdapter({ commands }) {
  function executeExact(commandId) {
    const id = String(commandId || '').trim();
    if (!id) {
      return {
        ok:false, executed:false, commandId:null, result:null,
        reason:'missing-command-id', error:'Obsidian commandId mangler'
      };
    }
    if (!commands || typeof commands.executeCommandById !== 'function') {
      return {
        ok:false, executed:false, commandId:id, result:null,
        reason:'execute-unavailable', error:'commands.executeCommandById er ikke tilgjengelig'
      };
    }
    try {
      const raw = commands.executeCommandById(id);
      const result = raw === undefined ? null : !!raw;
      if (raw === false) {
        return {
          ok:false, executed:false, commandId:id, result:false,
          reason:'command-returned-false', error:null
        };
      }
      return {
        ok:true, executed:true, commandId:id, result,
        reason:'execute-command-by-id', error:null
      };
    } catch (error) {
      return {
        ok:false, executed:false, commandId:id, result:null,
        reason:'execute-failed', error:error instanceof Error ? error.message : String(error)
      };
    }
  }

  return Object.freeze({
    contractVersion: OBSIDIAN_COMMAND_EXECUTION_CONTRACT_VERSION,
    executeExact
  });
}

module.exports = {
  OBSIDIAN_COMMAND_EXECUTION_CONTRACT_VERSION,
  createObsidianCommandExecutionAdapter
};
