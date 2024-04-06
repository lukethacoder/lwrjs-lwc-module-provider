import type { ModuleCompiled, ModuleEntry, ModuleProvider, ModuleSource, ProviderContext, AbstractModuleId } from '@lwrjs/types';
export interface LwcModuleProviderOptions {
    disableCaching?: boolean;
}
export default class LwcModuleProvider implements ModuleProvider {
    name: string;
    private rootDir;
    private moduleFsCacheEnabled;
    private interchangeableModulesEnabled;
    private lwcCacheDir?;
    private lwcCacheIndex?;
    private moduleSourceCache;
    private packageVersionCache;
    private modules;
    private emitter;
    private watcher?;
    private watchedModuleContextMap;
    private moduleEntryVersionCache;
    private importerMappingCache;
    private lwcCompiler;
    private inflightGetModuleJobs;
    private inflightGetModuleEntryJobs;
    constructor(options: LwcModuleProviderOptions | undefined, { appEmitter, config: { modules, rootDir, cacheDir, environment }, runtimeEnvironment: { watchFiles }, watcherFactory, }: ProviderContext);
    onModuleChange(fileChanged: string): Promise<void>;
    getModule(moduleId: AbstractModuleId): Promise<ModuleCompiled | undefined>;
    /**
     * Create a new Job to fetch a module by id so we are not duplicating effort when multiple requests come in
     * @param moduleId Id of module in question
     * @returns Compiled Module
     */
    createGetModuleJob(moduleId: AbstractModuleId): Promise<ModuleCompiled | undefined>;
    getModuleSource({ name, namespace, specifier }: AbstractModuleId, moduleEntry: ModuleEntry): Promise<ModuleSource>;
    getModuleEntry({ specifier, importer, version, }: AbstractModuleId): Promise<ModuleEntry | undefined>;
    createModuleEntry({ specifier, importer, version, }: AbstractModuleId): Promise<ModuleEntry | undefined>;
    private getCachedModuleEntry;
}
//# sourceMappingURL=index.d.ts.map