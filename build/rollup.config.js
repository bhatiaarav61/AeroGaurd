/**
 * Rollup Configuration — Optimized, tree-shaken, minified
 * Builds for Chrome MV3 extension with code splitting
 */

import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';

const isProduction = process.env.NODE_ENV === 'production';
const isDev = !isProduction;

const banner = `/**
 * AeroGuard Ultimate v5.0.0
 * Enterprise-grade ad-blocker for Manifest V3
 * Built: ${new Date().toISOString()}
 * License: MIT
 */`;

export default [
  // Background Service Worker
  {
    input: 'background/service-worker.js',
    output: {
      file: 'dist/background/service-worker.js',
      format: 'es',
      banner,
      sourcemap: isDev,
      generatedCode: 'es2015'
    },
    plugins: [
      resolve({ browser: true, preferBuiltins: false }),
      commonjs(),
      typescript({ tsconfig: false, compilerOptions: { target: 'ES2022', module: 'ESNext' } }),
      isProduction && terser({
        ecma: 2022,
        compress: { passes: 3, pure_getters: true },
        mangle: { toplevel: true },
        format: { comments: false }
      })
    ].filter(Boolean),
    external: ['chrome'],
    onwarn(warning, warn) {
      if (warning.code === 'EVAL' || warning.code === 'UNUSED_EXTERNAL_IMPORT') return;
      warn(warning);
    }
  },

  // Content Scripts
  {
    input: {
      'youtube-content': 'content/youtube-content.js',
      'generic-content': 'content/generic-content.js',
      'shadow-content': 'content/shadow-content.js',
      'iframe-content': 'content/iframe-content.js',
      'scriptlet-runner': 'content/scriptlet-runner.js'
    },
    output: {
      dir: 'dist/content',
      format: 'iife',
      banner,
      sourcemap: isDev,
      generatedCode: 'es2015',
      entryFileNames: '[name].js'
    },
    plugins: [
      resolve({ browser: true, preferBuiltins: false }),
      commonjs(),
      typescript({ tsconfig: false, compilerOptions: { target: 'ES2022', module: 'ESNext' } }),
      isProduction && terser({
        ecma: 2022,
        compress: { passes: 3, pure_getters: true },
        mangle: { toplevel: true },
        format: { comments: false }
      })
    ].filter(Boolean),
    external: ['chrome']
  },

  // Popup
  {
    input: 'ui/popup/popup.js',
    output: {
      file: 'dist/ui/popup/popup.js',
      format: 'iife',
      banner,
      sourcemap: isDev,
      generatedCode: 'es2015',
      name: 'AeroGuardPopup'
    },
    plugins: [
      resolve({ browser: true, preferBuiltins: false }),
      commonjs(),
      typescript({ tsconfig: false, compilerOptions: { target: 'ES2022', module: 'ESNext' } }),
      isProduction && terser({
        ecma: 2022,
        compress: { passes: 3 },
        mangle: { toplevel: true },
        format: { comments: false }
      })
    ].filter(Boolean),
    external: ['chrome']
  },

  // Options
  {
    input: 'ui/options/options.js',
    output: {
      file: 'dist/ui/options/options.js',
      format: 'iife',
      banner,
      sourcemap: isDev,
      generatedCode: 'es2015',
      name: 'AeroGuardOptions'
    },
    plugins: [
      resolve({ browser: true, preferBuiltins: false }),
      commonjs(),
      typescript({ tsconfig: false, compilerOptions: { target: 'ES2022', module: 'ESNext' } }),
      isProduction && terser({
        ecma: 2022,
        compress: { passes: 3 },
        mangle: { toplevel: true },
        format: { comments: false }
      })
    ].filter(Boolean),
    external: ['chrome']
  },

  // Welcome
  {
    input: 'ui/welcome/welcome.js',
    output: {
      file: 'dist/ui/welcome/welcome.js',
      format: 'iife',
      banner,
      sourcemap: isDev,
      generatedCode: 'es2015',
      name: 'AeroGuardWelcome'
    },
    plugins: [
      resolve({ browser: true, preferBuiltins: false }),
      commonjs(),
      typescript({ tsconfig: false, compilerOptions: { target: 'ES2022', module: 'ESNext' } }),
      isProduction && terser({
        ecma: 2022,
        compress: { passes: 3 },
        mangle: { toplevel: true },
        format: { comments: false }
      })
    ].filter(Boolean),
    external: ['chrome']
  },

  // Test Runner
  {
    input: 'test/runner.js',
    output: {
      file: 'dist/test/runner.js',
      format: 'iife',
      banner,
      sourcemap: isDev,
      generatedCode: 'es2015'
    },
    plugins: [
      resolve({ browser: true, preferBuiltins: false }),
      commonjs(),
      isProduction && terser({
        ecma: 2022,
        compress: { passes: 2 },
        format: { comments: false }
      })
    ].filter(Boolean)
  }
];