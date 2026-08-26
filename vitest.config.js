import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['test/**/*.test.{js,mjs}'],
    testTimeout: 10000,
    transformMode: {
      web: [/\.[jt]s$/]
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'test/', 'build/', 'dist/']
    }
  },
  resolve: {
    alias: {
      '@': '/c/Users/PC/Documents/AeroGaurd'
    }
  }
});
