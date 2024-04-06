import { transformSync as babelTransform } from '@babel/core'
import { transformSync } from '@lwc/compiler'
import { EXPLICIT_CONSTANT } from './utils.js'
import { logger } from '@lwrjs/diagnostics'
const DEFAULT_BABEL_CONFIG = {
  babelrc: false,
  configFile: false,
  sourceMaps: true,
  parserOpts: {
    plugins: [['decorators', { decoratorsBeforeExport: true }]],
  },
}
export class LwcCompiler {
  // compileFile takes a html, css, typescript, etc, and transforms it to a es6 module
  async compileFile(source, config) {
    const {
      enableLightningWebSecurityTransforms,
      filename,
      name,
      namespace,
      scopedStyles,
    } = config
    if (source.startsWith(EXPLICIT_CONSTANT)) {
      return {
        code: source,
        map: null,
        metadata: {},
      }
    }
    if (filename.endsWith('ts')) {
      const babelConfig = {
        ...DEFAULT_BABEL_CONFIG,
        presets: [
          ['@babel/preset-typescript', { onlyRemoveTypeImports: false }],
        ],
        filename,
      }
      logger.debug({
        label: 'LwcCompiler',
        message: 'babelTransform',
        additionalInfo: { babelConfig },
      })
      let result
      try {
        result = babelTransform(source, babelConfig)
      } catch (error) {
        logger.debug({
          label: 'LwcCompiler',
          message: 'babelTransform error',
          additionalInfo: error,
        })
        throw error
      }
      logger.verbose({
        label: 'LwcCompiler',
        message: 'babelTransform result',
        additionalInfo: { result },
      })
      if (!result || !result.code) {
        logger.debug({
          label: 'LwcCompiler',
          message: 'babelTransform invalid result',
          additionalInfo: { result },
        })
        throw new Error(`Error TS compiling ${filename}`)
      }
      source = result.code
    }
    // HACK: This is to avoid running the LWC compiler on the HMR module until we dont allow swap methods
    if (namespace === 'lwr' && name === 'hmr') {
      return {
        code: source,
        map: null,
        metadata: {},
      }
    }
    const transformConfig = {
      namespace,
      name,
      experimentalDynamicComponent: {
        strictSpecifier: false,
      },
      scopedStyles,
      enableDynamicComponents: true,
      enableLightningWebSecurityTransforms,
      enableScopedSlots: true, // this flag turns on an additive feature and is backwards compatible
    }
    logger.debug({
      label: 'LwcCompiler',
      message: 'transformSync',
      additionalInfo: { filename, transformConfig },
    })
    const compilerResult = transformSync(source, filename, transformConfig)
    logger.verbose({
      label: 'LwcCompiler',
      message: 'transformSync result',
      additionalInfo: { compilerResult },
    })
    return {
      code: compilerResult.code,
      map: null,
      metadata: {},
    }
  }
}
//# sourceMappingURL=compiler.js.map
