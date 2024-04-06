import type { ModuleSource, CompilerResult } from '@lwrjs/types';
export declare const DEFAULT_COMPILED_DIR = "lwc_compiled_modules";
export declare const DEFAULT_CACHE_FOLDER = "cache";
export declare const DEFAULT_CACHE_INDEX = "compiled.json";
export interface ModuleCacheEntry {
    ownHash: string;
    module: string;
    moduleMeta: string;
}
export interface ModuleCacheContext {
    lwcCacheDir: string;
    lwcCacheIndex: Map<string, ModuleCacheEntry>;
}
/**
 * The module cache allow us to recover modules compiled across server restart
 * We store an index file and the compiler modules individually
 */
export declare function setupModuleCache(cacheDir: string): ModuleCacheContext;
export declare function addCompiledModuleCacheEntry(moduleSource: ModuleSource, compilerResult: CompilerResult, { lwcCacheIndex, lwcCacheDir }: ModuleCacheContext): Promise<any>;
export declare function getCompiledModuleCacheEntry({ specifier, version, ownHash }: ModuleSource, { lwcCacheIndex, lwcCacheDir }: ModuleCacheContext): CompilerResult | undefined;
//# sourceMappingURL=cache.d.ts.map