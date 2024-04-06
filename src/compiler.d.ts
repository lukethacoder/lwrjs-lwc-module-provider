import type { CompilerResult, LwcCompilerConfig } from '@lwrjs/types';
export interface BundleFiles {
    [filename: string]: string;
}
export declare class LwcCompiler {
    compileFile(source: string, config: LwcCompilerConfig): Promise<CompilerResult>;
}
//# sourceMappingURL=compiler.d.ts.map