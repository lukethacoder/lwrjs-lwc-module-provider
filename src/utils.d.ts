import type {
  ResolverModuleRecord,
  Watcher,
  WatcherFactory,
} from '@lwrjs/types'
import { RegistryEntry } from '@lukethacoder/lwc-module-resolver'
export declare const EXPLICIT_CONSTANT = '/* _implicit_dependency_ */'
export declare const DEFAULT_IMPLICIT_DEP: string
export declare function resolveModuleSpecifier(
  specifier: string,
  importer: string,
  modules: ResolverModuleRecord[] | undefined,
  packageVersionCache: Map<string, string>
): Required<RegistryEntry>
export declare function isImplicitLwcImport(
  entry: string,
  specifier: string
): boolean
export declare function setUpWatcher(
  watcherFactory: WatcherFactory,
  onModuleChange: Function
): Watcher
//# sourceMappingURL=utils.d.ts.map
