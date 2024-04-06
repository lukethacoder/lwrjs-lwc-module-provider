import { dirname, join } from 'path'
import {
  explodeSpecifier,
  getSpecifier,
  hashContent,
  InflightTasks,
  readFile,
  resolveFileExtension,
  resolveCustomLWCMetadata,
} from '@lwrjs/shared-utils'
import { logger } from '@lwrjs/diagnostics'
import {
  DEFAULT_IMPLICIT_DEP,
  isImplicitLwcImport,
  resolveModuleSpecifier,
  setUpWatcher,
} from './utils.js'
import {
  addCompiledModuleCacheEntry,
  getCompiledModuleCacheEntry,
  setupModuleCache,
} from './cache.js'
import { LwcCompiler } from './compiler.js'
function getModuleEntryCacheKey(specifier, version) {
  return `${specifier}@${version}`
}
export default class LwcModuleProvider {
  constructor(
    options = {},
    {
      appEmitter,
      config: { modules, rootDir, cacheDir, environment },
      runtimeEnvironment: { watchFiles },
      watcherFactory,
    }
  ) {
    this.name = '@lukethacoder/lwrjs-lwc-module-provider'
    this.moduleSourceCache = new Map()
    this.packageVersionCache = new Map()
    this.watchedModuleContextMap = new Map()
    this.moduleEntryVersionCache = new Map()
    this.importerMappingCache = new Map()
    this.lwcCompiler = new LwcCompiler()
    this.inflightGetModuleJobs = new InflightTasks()
    this.inflightGetModuleEntryJobs = new InflightTasks()
    const { disableCaching } = options
    this.emitter = appEmitter
    this.modules = modules
    this.rootDir = rootDir
    this.watcher =
      watchFiles && watcherFactory
        ? setUpWatcher(watcherFactory, this.onModuleChange.bind(this))
        : undefined
    this.moduleFsCacheEnabled =
      disableCaching !== undefined ? !disableCaching : true
    this.interchangeableModulesEnabled = !!environment?.default
    // Module Cache setup
    if (this.moduleFsCacheEnabled) {
      const { lwcCacheDir, lwcCacheIndex } = setupModuleCache(cacheDir)
      this.lwcCacheDir = lwcCacheDir
      this.lwcCacheIndex = lwcCacheIndex
    }
  }
  async onModuleChange(fileChanged) {
    const moduleContext = this.watchedModuleContextMap.get(fileChanged)
    if (!moduleContext) {
      throw new Error(
        'We are observing a file we have not yet processed, this should not happen...'
      )
    }
    const { moduleId, id } = moduleContext
    this.moduleSourceCache.delete(id)
    const recompiledModule = await this.getModule(moduleId)
    if (recompiledModule) {
      this.emitter.notifyModuleSourceChanged(recompiledModule)
    }
  }
  async getModule(moduleId) {
    const id = getSpecifier(moduleId)
    logger.debug({ label: `${this.name}`, message: `getModule ${id}` })
    return this.inflightGetModuleJobs.execute(id, () => {
      return this.createGetModuleJob(moduleId)
    })
  }
  /**
   * Create a new Job to fetch a module by id so we are not duplicating effort when multiple requests come in
   * @param moduleId Id of module in question
   * @returns Compiled Module
   */
  async createGetModuleJob(moduleId) {
    const {
      watcher,
      watchedModuleContextMap,
      lwcCacheDir,
      lwcCacheIndex,
      moduleFsCacheEnabled,
    } = this
    logger.debug({
      label: `${this.name}`,
      message: 'fetch module',
      additionalInfo: { moduleId, moduleFsCacheEnabled },
    })
    const moduleEntry = await this.getModuleEntry(moduleId)
    if (!moduleEntry) {
      return
    }
    const moduleSource = await this.getModuleSource(moduleId, moduleEntry)
    const { id, namespace, name: rawName, originalSource } = moduleSource
    const cacheConfig = { lwcCacheDir, lwcCacheIndex }
    let compiledModule =
      moduleFsCacheEnabled &&
      getCompiledModuleCacheEntry(moduleSource, cacheConfig)
    logger.debug({
      label: `${this.name}`,
      message: 'module source',
      additionalInfo: { moduleId, isPreCompiled: compiledModule != undefined },
    })
    if (!compiledModule) {
      const [name] = rawName.split('#')
      const scopedStyles =
        moduleEntry.entry.endsWith('.css') &&
        moduleEntry.specifier.endsWith('?scoped=true')
      logger.debug({
        label: `${this.name}`,
        message: 'compile',
        additionalInfo: {
          namespace,
          name,
          filename: moduleEntry.entry,
          scopedStyles,
        },
      })
      // We need to convert anything (html, css, javascript) into a canonical ES6 module
      compiledModule = await this.lwcCompiler.compileFile(originalSource, {
        namespace,
        name,
        filename: moduleEntry.entry,
        scopedStyles,
      })
      logger.verbose({
        label: `${this.name}`,
        message: 'createGetModuleJob:compile compiledModule',
        additionalInfo: {
          namespace,
          name,
          filename: moduleEntry.entry,
          scopedStyles,
        },
      })
      if (moduleFsCacheEnabled) {
        await addCompiledModuleCacheEntry(
          moduleSource,
          compiledModule,
          cacheConfig
        )
      }
    }
    if (watcher && !watchedModuleContextMap.has(moduleEntry.entry)) {
      watcher.add(moduleEntry.entry)
      watchedModuleContextMap.set(moduleEntry.entry, { id, moduleId })
    }
    return {
      ...moduleSource,
      compiledSource: compiledModule.code,
      compiledMetadata: compiledModule.metadata,
    }
  }

  async getModuleSource({ name, namespace, specifier }, moduleEntry) {
    const { entry, version, id } = moduleEntry
    const implicitLwc = isImplicitLwcImport(entry, specifier)
    if (this.moduleSourceCache.has(id)) {
      return this.moduleSourceCache.get(id)
    }
    name = name || explodeSpecifier(specifier).name
    const originalSource = implicitLwc ? DEFAULT_IMPLICIT_DEP : readFile(entry)
    const ownHash = hashContent(originalSource)
    const moduleSource = {
      id,
      namespace,
      name: name,
      version,
      specifier,
      moduleEntry,
      ownHash,
      originalSource,
    }
    this.moduleSourceCache.set(id, moduleSource)
    return moduleSource
  }

  async getModuleEntry({ specifier, importer, version }) {
    logger.debug({
      label: `${this.name}`,
      message: `getModuleEntry ${specifier}@${version}@${importer}`,
    })
    // Check cache
    const moduleEntry = this.getCachedModuleEntry(specifier, version, importer)
    if (moduleEntry) {
      return moduleEntry
    }
    const jobKey = `${specifier}@${version}@${importer}`
    return this.inflightGetModuleEntryJobs.execute(jobKey, async () => {
      return this.createModuleEntry({ specifier, importer, version })
    })
  }

  async createModuleEntry({ specifier, importer, version }) {
    logger.debug({
      label: `${this.name}`,
      message: 'createModuleEntry',
      additionalInfo: {
        specifier,
        importer,
        rootDir: this.rootDir,
        version,
      },
    })
    // Strip any filenames out of the specifier
    // eg: 'c/myApp#myApp.css' => 'c/myApp' and 'myApp.css'
    // eg: 'some/where#lib/util' => 'some/where' and 'lib/util'
    const [baseSpecifier, fileRelativePathRaw] = specifier.split('#')
    const fileRelativePath = fileRelativePathRaw?.split('?')[0] // Remove queryString as LWC uses it for scope style
    let moduleEntry
    // If this is a relative import, check the cache for the base specifier first
    if (fileRelativePath) {
      moduleEntry = this.getCachedModuleEntry(specifier, version, importer)
    }
    // Nothing from cache, let's try to resolve it first from lwc then from npm
    if (!moduleEntry) {
      try {
        logger.debug({
          label: `${this.name}`,
          message: 'createModuleEntry:resolveModuleSpecifier',
          additionalInfo: {
            baseSpecifier,
            importer,
            rootDir: this.rootDir,
          },
        })
        const registryEntry = resolveModuleSpecifier(
          baseSpecifier,
          importer || this.rootDir,
          this.modules,
          this.packageVersionCache
        )
        logger.debug({
          label: `${this.name}`,
          message: 'createModuleEntry:registryEntry',
          additionalInfo: { registryEntry },
        })
        moduleEntry = {
          id: getModuleEntryCacheKey(
            registryEntry.specifier,
            registryEntry.version
          ),
          ...registryEntry,
        }
        if (this.interchangeableModulesEnabled && moduleEntry.scope) {
          // check if the module is interchangeable
          const metadata = resolveCustomLWCMetadata(moduleEntry.scope)
          if (metadata.interchangeable?.includes(moduleEntry.specifier)) {
            moduleEntry.interchangeable = true
          }
        }
      } catch (e) {
        if (e.code !== 'NO_LWC_MODULE_FOUND') {
          throw e
        } else {
          // in verbose log the lwc provider miss
          logger.verbose({
            label: `${this.name}`,
            message: `LWC provider could not find the module ${specifier}`,
          })
        }
      }
    }
    if (!moduleEntry) {
      return
    }
    // Resolve path to relative import
    if (fileRelativePath) {
      const moduleEntryRoot = dirname(moduleEntry.entry)
      const filePath = join(moduleEntryRoot, fileRelativePath)
      // Make a copy so the cached entry for the base specifier isn't corrupted
      moduleEntry = {
        ...moduleEntry,
        entry: resolveFileExtension(filePath),
        specifier,
      }
    }
    // Store in memory cache
    const cacheKey = getModuleEntryCacheKey(specifier, moduleEntry.version)
    const finalModuleEntry = { ...moduleEntry, id: cacheKey }
    this.moduleEntryVersionCache.set(cacheKey, finalModuleEntry)
    if (!version) {
      // if this module is being resolved via importer rather than version,
      // then use the importer as part of the cache key to avoid future cache misses
      const importerCacheKey = getModuleEntryCacheKey(
        specifier,
        importer || this.rootDir
      )
      this.importerMappingCache.set(importerCacheKey, cacheKey)
    }
    return finalModuleEntry
  }

  getCachedModuleEntry(specifier, version, importer) {
    let moduleEntry
    if (version) {
      const cacheKey = getModuleEntryCacheKey(specifier, version)
      moduleEntry = this.moduleEntryVersionCache.get(cacheKey)
    }
    if (!moduleEntry) {
      const importerKey = getModuleEntryCacheKey(
        specifier,
        importer || this.rootDir
      )
      const cacheKey = this.importerMappingCache.get(importerKey)
      if (cacheKey) {
        moduleEntry = this.moduleEntryVersionCache.get(cacheKey)
      }
    }
    return moduleEntry
  }
}
//# sourceMappingURL=index.js.map
