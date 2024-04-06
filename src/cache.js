import path from 'path'
import fs from 'fs-extra'
import { logger } from '@lwrjs/diagnostics'
export const DEFAULT_COMPILED_DIR = 'lwc_compiled_modules'
export const DEFAULT_CACHE_FOLDER = 'cache'
export const DEFAULT_CACHE_INDEX = `compiled.json`
// eslint-disable-next-line no-useless-escape
const NORMALIZE_PATH_REGEX = /[@\/#\.\?<>\\:\*\|"]/gm
/**
 * The module cache allow us to recover modules compiled across server restart
 * We store an index file and the compiler modules individually
 */
export function setupModuleCache(cacheDir) {
  const lwcCacheDir = path.join(cacheDir, `${DEFAULT_COMPILED_DIR}`)
  const lwcCacheIndexPath = path.join(lwcCacheDir, DEFAULT_CACHE_INDEX)
  fs.mkdirSync(`${lwcCacheDir}/${DEFAULT_CACHE_FOLDER}`, { recursive: true })
  if (!fs.existsSync(lwcCacheIndexPath)) {
    fs.writeFileSync(lwcCacheIndexPath, '[]')
    return { lwcCacheDir, lwcCacheIndex: new Map() }
  } else {
    const cacheIndexJson = fs.readJSONSync(lwcCacheIndexPath, 'utf-8')
    return { lwcCacheDir, lwcCacheIndex: new Map(cacheIndexJson) }
  }
}
class IndexPersister {
  async persist({ lwcCacheIndex, lwcCacheDir }) {
    // Clear previous timer
    if (this.updateTimer) {
      clearTimeout(this.updateTimer)
    }
    this.lwcCacheIndex = lwcCacheIndex
    this.lwcCacheDir = lwcCacheDir
    // Set a new timer for 1 second
    this.updateTimer = setTimeout(() => {
      this.persistData()
      this.lwcCacheIndex = undefined
      this.lwcCacheDir = undefined
      this.updateTimer = undefined
    }, 1000)
  }
  persistData() {
    // Write data to disk
    const lwcCacheIndexPath = path.join(this.lwcCacheDir, DEFAULT_CACHE_INDEX)
    fs.writeJSONSync(lwcCacheIndexPath, [...this.lwcCacheIndex])
    logger.debug('lwc-module-provider', `LWC Index Updated`)
  }
}
const INDEX_PERSISTER = new IndexPersister()
let moduleCount = 0
export async function addCompiledModuleCacheEntry(
  moduleSource,
  compilerResult,
  { lwcCacheIndex, lwcCacheDir }
) {
  const { specifier, version, ownHash } = moduleSource
  const cacheKey = `${specifier}@${version}`
  if (++moduleCount % 1000 === 0) {
    logger.debug({
      label: `lwc-module-provider`,
      message: `Compiled Modules >${moduleCount}`,
    })
  }
  // Normalize name for fs storage
  const normalizedSpecifier = specifier.replace(NORMALIZE_PATH_REGEX, '_')
  const normalizedVersion = version.replace(NORMALIZE_PATH_REGEX, '_')
  // Store module cached file
  const moduleFileName = `${normalizedSpecifier}_${normalizedVersion}.js`
  const cachedModulePath = path.join(
    lwcCacheDir,
    DEFAULT_CACHE_FOLDER,
    moduleFileName
  )
  const writeModulePromise = fs.writeFile(cachedModulePath, compilerResult.code)
  // Store module metadata
  const moduleMetaFileName = `${normalizedSpecifier}_${normalizedVersion}.meta.json`
  const cachedMetaPath = path.join(
    lwcCacheDir,
    DEFAULT_CACHE_FOLDER,
    moduleMetaFileName
  )
  const writeMetadataPromise = fs.writeJSON(
    cachedMetaPath,
    compilerResult.metadata
  )
  // WIP: Store sourcemaps
  // Set new cache key in memory and persistent storage
  lwcCacheIndex.set(cacheKey, {
    ownHash,
    module: `./${DEFAULT_CACHE_FOLDER}/${moduleFileName}`,
    moduleMeta: `./${DEFAULT_CACHE_FOLDER}/${moduleMetaFileName}`,
  })
  // Will persist the index after 1 second of inactivity
  const writeMetadata = INDEX_PERSISTER.persist({ lwcCacheIndex, lwcCacheDir })
  return Promise.all([writeModulePromise, writeMetadataPromise, writeMetadata])
}
export function getCompiledModuleCacheEntry(
  { specifier, version, ownHash },
  { lwcCacheIndex, lwcCacheDir }
) {
  const cacheKey = `${specifier}@${version}`
  const cacheEntry = lwcCacheIndex.get(cacheKey)
  if (!cacheEntry) {
    return
  }
  const cacheModulePath = path.join(lwcCacheDir, cacheEntry.module)
  const cacheMetaPath = path.join(lwcCacheDir, cacheEntry.moduleMeta)
  if (
    ownHash === cacheEntry.ownHash &&
    fs.existsSync(cacheModulePath) &&
    fs.existsSync(cacheMetaPath)
  ) {
    return {
      code: fs.readFileSync(cacheModulePath, 'utf-8'),
      metadata: JSON.parse(fs.readFileSync(cacheMetaPath, 'utf-8')),
    }
  }
}
//# sourceMappingURL=cache.js.map
