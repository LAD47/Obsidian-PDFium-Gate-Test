'use strict';
const OBSIDIAN_FRONTMATTER_CONTRACT_VERSION='0.1';
function createObsidianFrontmatterAdapter({fileManager}) {
  async function processFrontMatter(file,callback) {
    if(!fileManager || typeof fileManager.processFrontMatter!=='function') throw new Error('fileManager.processFrontMatter er ikke tilgjengelig');
    if(!file || typeof callback!=='function') throw new Error('frontmatter update mangler fil eller callback');
    return await fileManager.processFrontMatter(file,frontmatter=>callback(frontmatter));
  }
  return Object.freeze({contractVersion:OBSIDIAN_FRONTMATTER_CONTRACT_VERSION,processFrontMatter});
}
module.exports={OBSIDIAN_FRONTMATTER_CONTRACT_VERSION,createObsidianFrontmatterAdapter};
