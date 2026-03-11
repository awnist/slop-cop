import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/slop-cop/' : '/',
  test: {
    environment: 'node',
    envFile: '.env',
    exclude: [
      '**/node_modules/**',
      '**/llmDetectors.test.ts',  // requires ANTHROPIC_API_KEY, run via pnpm test:llm
    ],
  },
}))
