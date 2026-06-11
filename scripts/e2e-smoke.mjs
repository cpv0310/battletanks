/**
 * Browser smoke test: serves the production build, starts a real match with
 * two sample bots, and verifies the simulation actually runs (clock advances,
 * no fatal overlay). Requires Google Chrome and network access (Pyodide CDN).
 *
 * Usage: node scripts/e2e-smoke.mjs
 */
import { spawn } from 'node:child_process'
import { chromium } from 'playwright-core'

const PORT = 4173
const URL = `http://localhost:${PORT}/`

function fail(message) {
  console.error(`✗ ${message}`)
  process.exitCode = 1
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Server at ${url} did not start within ${timeoutMs}ms`)
}

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore',
})
let browser = null

try {
  await waitForServer(URL, 20_000)
  console.log('• preview server up')

  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const page = await browser.newPage()
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(String(error)))

  await page.goto(URL, { waitUntil: 'load' })
  await page.waitForSelector('.btn-start', { timeout: 10_000 })
  console.log('• setup screen rendered')

  // Save the current script under a new name, reload, and verify it persisted.
  await page.fill('.setup-panel input.input:not(.input-seed):not(.input-player)', 'SmokeTestBot')
  await page.click('.setup-panel button:has-text("Save")')
  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('.btn-start', { timeout: 10_000 })
  const savedVisible = await page.evaluate(() =>
    [...document.querySelectorAll('.setup-panel select option')].some(
      (option) => option.textContent === 'SmokeTestBot',
    ),
  )
  if (savedVisible) {
    console.log('• script saved to library and survived a reload')
  } else {
    fail('saved script did not appear in the library after reload')
  }

  await page.click('.btn-start')
  console.log('• battle started, waiting for Python runtime (CDN)…')

  // The clock leaving 0:00 proves: worker spawned, Pyodide loaded, bots
  // loaded, and the simulation is ticking.
  await page.waitForFunction(
    () => document.querySelector('.clock')?.textContent !== '0:00',
    { timeout: 120_000 },
  )
  console.log('• simulation is ticking')

  // Let the match run a little, then check health indicators.
  await page.waitForTimeout(8_000)

  const aborted = await page.evaluate(
    () => !document.querySelector('.overlay')?.classList.contains('hidden') &&
      (document.querySelector('.overlay')?.textContent ?? '').includes('aborted'),
  )
  if (aborted) fail('match aborted via fatal overlay')

  const crashedCards = await page.evaluate(() =>
    [...document.querySelectorAll('.tank-status')].filter((el) =>
      el.textContent?.includes('Crashed'),
    ).length,
  )
  if (crashedCards > 0) fail(`${crashedCards} bot(s) crashed`)

  const consoleErrors = await page.evaluate(() =>
    [...document.querySelectorAll('.console-err')].map((el) => el.textContent ?? ''),
  )
  if (consoleErrors.length > 0) fail(`bot console shows errors: ${consoleErrors.join(' | ')}`)

  const canvasSize = await page.evaluate(() => {
    const canvas = document.querySelector('#game canvas')
    return canvas ? canvas.width * canvas.height : 0
  })
  if (canvasSize === 0) fail('game canvas missing or empty')

  if (pageErrors.length > 0) fail(`page errors: ${pageErrors.join(' | ')}`)

  await page.screenshot({ path: '/tmp/battletanks-smoke.png' })
  console.log('• screenshot saved to /tmp/battletanks-smoke.png')

  if (process.exitCode !== 1) {
    const clock = await page.textContent('.clock')
    console.log(`✓ smoke test passed (match clock at ${clock})`)
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
} finally {
  await browser?.close()
  server.kill()
}
