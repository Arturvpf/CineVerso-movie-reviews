import { defineConfig, devices } from '@playwright/test'
import { resolve } from 'node:path'

const backend = resolve(import.meta.dirname, '../backend')
const python = resolve(backend, process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python')

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  use: { baseURL: 'http://localhost:5174', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    { command: `"${python}" -m tests.run_e2e`, cwd: backend,
      url: 'http://localhost:8011/health', reuseExistingServer: false, timeout: 60_000 },
    { command: 'npm run dev -- --port 5174', url: 'http://localhost:5174',
      env: { VITE_API_URL: 'http://localhost:8011' }, reuseExistingServer: false },
  ],
})
