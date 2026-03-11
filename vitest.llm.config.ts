import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    envFile: '.env',
    include: ['src/detectors/__tests__/llmDetectors.test.ts'],
  },
})
