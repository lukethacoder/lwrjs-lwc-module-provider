import fs from 'fs'
import path from 'path'
import { logger } from '@lwrjs/diagnostics'
import { readFile, debounce } from '@lwrjs/shared-utils'
import { resolveModule } from '@lukethacoder/lwc-module-resolver'
export const EXPLICIT_CONSTANT = '/* _implicit_dependency_ */'
export const DEFAULT_IMPLICIT_DEP = `${EXPLICIT_CONSTANT} export default void 0`
export function resolveModuleSpecifier(
  specifier,
  importer,
  modules = [],
  packageVersionCache
) {
  logger.debug({
    label: `@lukethacoder/lwrjs-lwc-module-provider`,
    message: 'resolveModuleSpecifier',
    additionalInfo: { specifier, importer },
  })
  let resolvedModule
  try {
    resolvedModule = resolveModule(specifier, importer, { modules })
  } catch (error) {
    if (logger.isDebugEnabled()) {
      // If log level is debug or greater.  Otherwise error will be swallowed and resolved by npm-resolver
      logger.debug({
        label: `@lukethacoder/lwrjs-lwc-module-provider`,
        message: `@lukethacoder/lwc-module-resolver/resolveModule ${specifier}`,
      })
      logger.error(error)
    }
    throw error
  }
  logger.debug({
    label: `@lukethacoder/lwrjs-lwc-module-provider`,
    message: 'resolveModuleSpecifier:resolvedModule',
    additionalInfo: { resolvedModule },
  })
  const moduleEntry = resolvedModule.entry
  let version
  if (packageVersionCache.has(moduleEntry)) {
    version = packageVersionCache.get(moduleEntry)
  } else {
    // Find the closest package.json file from the module entry. If none exists (possible with dir or alias module
    // records), fall back to using the "scope" from which the module is being imported.
    const packageJsonPath =
      findClosestPackageJsonPath(moduleEntry) ??
      path.join(resolvedModule.scope, 'package.json')
    const json = readFile(packageJsonPath)
    version = JSON.parse(json).version
    packageVersionCache.set(moduleEntry, version)
  }
  return { ...resolvedModule, version }
}
// Search upwards until a package.json file is found.
function findClosestPackageJsonPath(filepath) {
  let curDir = path.dirname(filepath)
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const possiblePath = path.join(curDir, 'package.json')
    const stats = fs.statSync(possiblePath, { throwIfNoEntry: false })
    if (stats?.isFile()) {
      return possiblePath
    } else {
      const curParentDir = path.dirname(curDir)
      if (curDir !== curParentDir) {
        curDir = curParentDir
      } else {
        return null
      }
    }
  }
}
// An implicit import is dependency that the LWC includes automatically to "auto-magically" bind JS, HTML and CSS
// Sometimes this file might not exist, in which case we need to provide a default
export function isImplicitLwcImport(entry, specifier) {
  const [, fileRelativePathQs] = specifier.split('#')
  const fileRelativePath = fileRelativePathQs?.split('?')[0] // Remove queryString as LWC uses it for scope style
  // If is not relative or the file exists it's not an implicit import
  if (!fileRelativePath || fs.existsSync(entry)) {
    return false
  }
  // The LWC compiler only does implicit imports for html or css
  const ext = path.extname(fileRelativePath)
  // Implicit scope style
  if (fileRelativePath.endsWith('.scoped.css')) {
    return true
  }
  if (ext !== '.html' && ext !== '.css') {
    return false
  }
  const parts = fileRelativePath.split('/')
  if (parts.length > 1) {
    // At this point this can only be implicit if
    // the importer has the same name besides the extension and exists
    // The importer extension is derived from the fact that implicitly:
    //  - js|ts must imports html
    //  - html must import css (which can also be implicit)
    if (ext === '.html') {
      const importerJsEntry = entry.replace('.html', '.js')
      const importerTsEntry = entry.replace('.html', '.ts')
      return fs.existsSync(importerJsEntry) || fs.existsSync(importerTsEntry)
    } else {
      const importerHtmlEntry = entry.replace('.css', '.html')
      const importerJsEntry = entry.replace('.css', '.js')
      const importerTsEntry = entry.replace('.css', '.ts')
      return (
        fs.existsSync(importerHtmlEntry) ||
        fs.existsSync(importerJsEntry) ||
        fs.existsSync(importerTsEntry)
      )
    }
  }
  return true
}
export function setUpWatcher(watcherFactory, onModuleChange) {
  const watcher = watcherFactory.createFileWatcher()
  watcher.on(
    'change',
    debounce((file) => onModuleChange(file), 500)
  )
  watcher.on(
    'unlink',
    debounce((file) => onModuleChange(file), 500)
  )
  watcher.on('add', (file) =>
    logger.info({
      label: `@lukethacoder/lwrjs-lwc-module-provider`,
      message: `Watching: ${file}`,
    })
  )
  return watcher
}
//# sourceMappingURL=utils.js.map
