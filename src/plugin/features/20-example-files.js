'use strict';

class ExampleFilesFeature {
  async ensureExampleFiles() {
    const targetVersion = PDFIUM_EXAMPLES_BOOTSTRAP_VERSION;
    const currentVersion = Number(this.settings?.exampleFilesBootstrapVersion || 0);
    if (currentVersion >= targetVersion) return {ok:true,created:[],skipped:[],version:currentVersion,alreadyInstalled:true};

    const read = this.obsidianVaultReadAdapter;
    const write = this.obsidianVaultWriteAdapter;
    if (!read || !write) return {ok:false,error:'vault adapters unavailable',created:[],skipped:[],version:currentVersion};

    try {
      const existingRoot = read.getAbstractFileByPath(PDFIUM_EXAMPLES_ROOT);
      if (existingRoot && !Array.isArray(existingRoot.children)) {
        throw new Error(`${PDFIUM_EXAMPLES_ROOT} exists but is not a folder`);
      }
      if (!existingRoot) await write.ensureFolder(PDFIUM_EXAMPLES_ROOT);

      const created=[];
      const skipped=[];
      for (const example of metadataExampleFiles()) {
        const existing=read.getAbstractFileByPath(example.path);
        if (existing) {
          skipped.push(example.path);
          continue;
        }
        await write.createText(example.path, example.content);
        created.push(example.path);
      }

      this.settings = this.settings || {};
      this.settings.exampleFilesBootstrapVersion = targetVersion;
      await this.obsidianPluginDataAdapter.saveData(this.settings);
      return {ok:true,created,skipped,version:targetVersion,alreadyInstalled:false};
    } catch (error) {
      const message=error instanceof Error ? error.message : String(error);
      console.warn(`[PDFium Gate Test ${PLUGIN_VERSION}] Could not install example files: ${message}`);
      return {ok:false,error:message,created:[],skipped:[],version:currentVersion};
    }
  }
}

module.exports = { ExampleFilesFeature };
