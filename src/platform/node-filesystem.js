'use strict';
const NODE_FILESYSTEM_CONTRACT_VERSION = '0.3';
function createNodeFilesystemAdapter({ fsModule }) {
  if (!fsModule) throw new Error('Node fs-modul mangler');
  function exists(filePath) {
    if (typeof fsModule.existsSync !== 'function') throw new Error('fs.existsSync er ikke tilgjengelig');
    return !!fsModule.existsSync(filePath);
  }
  function statKind(filePath) {
    if (typeof fsModule.statSync !== 'function') throw new Error('fs.statSync er ikke tilgjengelig');
    try {
      const stat = fsModule.statSync(filePath);
      if (stat?.isDirectory?.()) return 'directory';
      if (stat?.isFile?.()) return 'file';
      return 'other';
    } catch (error) {
      if (error && error.code === 'ENOENT') return 'missing';
      throw error;
    }
  }
  function readText(filePath, encoding = 'utf8') {
    if (typeof fsModule.readFileSync !== 'function') throw new Error('fs.readFileSync er ikke tilgjengelig');
    return String(fsModule.readFileSync(filePath, encoding));
  }
  function ensureDir(dirPath) {
    if (typeof fsModule.mkdirSync !== 'function') throw new Error('fs.mkdirSync er ikke tilgjengelig');
    fsModule.mkdirSync(dirPath, { recursive:true });
    return true;
  }
  function writeText(filePath, text, encoding = 'utf8') {
    if (typeof fsModule.writeFileSync !== 'function') throw new Error('fs.writeFileSync er ikke tilgjengelig');
    fsModule.writeFileSync(filePath, text, encoding);
    return true;
  }
  function removeFile(filePath) {
    if (typeof fsModule.unlinkSync !== 'function') throw new Error('fs.unlinkSync er ikke tilgjengelig');
    fsModule.unlinkSync(filePath);
    return true;
  }
  function rename(fromPath, toPath) {
    if (typeof fsModule.renameSync !== 'function') throw new Error('fs.renameSync er ikke tilgjengelig');
    fsModule.renameSync(fromPath, toPath);
    return true;
  }
  function copyFile(fromPath, toPath) {
    if (typeof fsModule.copyFileSync !== 'function') throw new Error('fs.copyFileSync er ikke tilgjengelig');
    fsModule.copyFileSync(fromPath, toPath);
    return true;
  }
  function removeTree(targetPath) {
    if (typeof fsModule.rmSync !== 'function') throw new Error('fs.rmSync er ikke tilgjengelig');
    fsModule.rmSync(targetPath, { recursive:true, force:true });
    return true;
  }
  return Object.freeze({contractVersion:NODE_FILESYSTEM_CONTRACT_VERSION,exists,statKind,readText,ensureDir,writeText,removeFile,rename,copyFile,removeTree});
}
module.exports={NODE_FILESYSTEM_CONTRACT_VERSION,createNodeFilesystemAdapter};
