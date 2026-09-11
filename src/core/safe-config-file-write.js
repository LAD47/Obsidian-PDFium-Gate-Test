'use strict';

const SAFE_CONFIG_FILE_WRITE_CONTRACT_VERSION = '0.2';

function safeConfigNormalizeVaultPath(vaultPath) {
  return String(vaultPath || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function safeConfigVaultDirname(vaultPath) {
  const normalized = safeConfigNormalizeVaultPath(vaultPath);
  const at = normalized.lastIndexOf('/');
  return at >= 0 ? normalized.slice(0, at) : '';
}

function safeConfigVaultJoin(...parts) {
  return parts.map(safeConfigNormalizeVaultPath).filter(Boolean).join('/');
}

function safeConfigTimestamp(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const pad = (n, width = 2) => String(n).padStart(width, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}-${pad(d.getMilliseconds(), 3)}`;
}

function safeConfigOperationToken() {
  const random = Math.random().toString(16).slice(2, 10);
  const pid = typeof process !== 'undefined' && Number.isInteger(process.pid) ? process.pid : 0;
  return `${pid}-${Date.now()}-${random}`;
}

function assertSafeConfigStore(store) {
  const required = ['exists','readText','writeText','ensureFolder','rename','removeFile'];
  if (!store || typeof store !== 'object') throw new Error('safe config write: file store missing');
  for (const method of required) if (typeof store[method] !== 'function') throw new Error(`safe config write: file store missing ${method}`);
}

async function safeConfigUniqueBackupPath(store, backupDir, backupStem, backupExtension, timestamp) {
  const extension = String(backupExtension || '').replace(/^\.+/, '');
  const suffix = extension ? `.${extension}` : '';
  const baseName = `${backupStem}-${timestamp}`;
  let candidate = safeConfigVaultJoin(backupDir, `${baseName}${suffix}`);
  let counter = 2;
  while (await store.exists(candidate)) {
    candidate = safeConfigVaultJoin(backupDir, `${baseName}-${counter}${suffix}`);
    counter += 1;
  }
  return candidate;
}

async function safeWriteConfigText({
  store,
  targetPath,
  backupDir,
  backupStem,
  backupExtension,
  text,
  validateText,
  timestamp = null,
  operationToken = null
}) {
  assertSafeConfigStore(store);
  const target = safeConfigNormalizeVaultPath(targetPath);
  const backupRoot = safeConfigNormalizeVaultPath(backupDir);
  if (!target) throw new Error('safe config write: target path missing');
  if (!backupRoot) throw new Error('safe config write: backup directory missing');
  if (!String(backupStem || '').trim()) throw new Error('safe config write: backup stem missing');
  if (typeof validateText !== 'function') throw new Error('safe config write: validateText missing');

  const payload = String(text);
  await validateText(payload);

  const targetDir = safeConfigVaultDirname(target);
  if (targetDir) await store.ensureFolder(targetDir);
  await store.ensureFolder(backupRoot);

  const existed = await store.exists(target);
  const previousText = existed ? await store.readText(target) : null;
  if (existed && previousText === payload) {
    return { changed:false, created:false, targetPath:target, backupPath:null };
  }

  let backupPath = null;
  if (existed) {
    const stamp = timestamp || safeConfigTimestamp();
    backupPath = await safeConfigUniqueBackupPath(store, backupRoot, String(backupStem), backupExtension, stamp);

    // The previous canonical payload is already in memory. Persist the backup through
    // the same write/read primitives that the canonical config path relies on, then
    // prove the backup exists and is byte-identical before touching the canonical file.
    await store.writeText(backupPath, previousText);
    if (!(await store.exists(backupPath))) throw new Error(`safe config write: backup missing after write: ${backupPath}`);
    const backupVerifyText = await store.readText(backupPath);
    if (backupVerifyText !== previousText) throw new Error(`safe config write: backup read-back mismatch: ${backupPath}`);
  }

  const token = operationToken || safeConfigOperationToken();
  const tempPath = `${target}.tmp-${token}`;
  const previousPath = `${target}.previous-${token}`;
  let previousMoved = false;
  let targetInstalled = false;

  try {
    await store.writeText(tempPath, payload);
    const verifyText = await store.readText(tempPath);
    await validateText(verifyText);

    if (existed) {
      await store.rename(target, previousPath);
      previousMoved = true;
    }
    await store.rename(tempPath, target);
    targetInstalled = true;

    const finalText = await store.readText(target);
    await validateText(finalText);
    if (finalText !== payload) throw new Error(`safe config write: read-back mismatch for ${target}`);

    if (previousMoved && await store.exists(previousPath)) await store.removeFile(previousPath);
    return { changed:true, created:!existed, targetPath:target, backupPath };
  } catch (error) {
    try { if (await store.exists(tempPath)) await store.removeFile(tempPath); } catch (_) {}
    if (previousMoved && await store.exists(previousPath)) {
      try { if (await store.exists(target)) await store.removeFile(target); } catch (_) {}
      try { await store.rename(previousPath, target); } catch (_) {}
    } else if (!existed && targetInstalled) {
      try { if (await store.exists(target)) await store.removeFile(target); } catch (_) {}
    }
    throw error;
  }
}

const safeConfigFileWriteContract = Object.freeze({
  SAFE_CONFIG_FILE_WRITE_CONTRACT_VERSION,
  safeConfigNormalizeVaultPath,
  safeConfigVaultDirname,
  safeConfigVaultJoin,
  safeConfigTimestamp,
  safeWriteConfigText
});

module.exports = safeConfigFileWriteContract;
