import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/slop-cop/' : '/',
  resolve: {
    alias: {
      // Bypass compromise's exports map to import individual three-tier plugins.
      // See src/detectors/nlpInstance.ts for full explanation of why this is needed.
      'compromise-verbs-plugin': path.resolve(__dirname, 'node_modules/compromise/src/3-three/verbs/plugin.js'),
      'compromise-adjectives-plugin': path.resolve(__dirname, 'node_modules/compromise/src/3-three/adjectives/plugin.js'),
    },
  },
  test: {
    environment: 'node',
    envFile: '.env',
    exclude: [
      '**/node_modules/**',
      '**/llmDetectors.test.ts',  // requires ANTHROPIC_API_KEY, run via pnpm test:llm
    ],
  },
}))
