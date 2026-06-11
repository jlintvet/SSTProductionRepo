/**
 * SST Workflow Monitor — Per-Workflow Configuration
 *
 * Keys must match the exact .yml filename in .github/workflows/.
 *
 * Fields:
 *   name                    — display name used in alert emails
 *   notifyAfterFailures     — send alert after this many consecutive failures
 *   infraStepPatterns       — extra regex patterns to classify a failing step
 *                             as transient (infrastructure noise) for THIS workflow.
 *                             Global patterns (checkout, setup-python, install deps)
 *                             are always applied on top of these.
 */

export const WORKFLOWS = {
  'VIIRSHourlyBundler.yml': {
    name: 'VIIRS Hourly Bundler',
    notifyAfterFailures: 2,      // root of chain — escalate quickly
    infraStepPatterns: [],
  },

  'Daily SST.yml': {
    name: 'SST Data Fetch',
    notifyAfterFailures: 3,
    infraStepPatterns: [
      /remove stale/i,           // cleanup step — not a real failure
    ],
  },

  'ChlorophyllandSeaColor.yml': {
    name: 'Daily Chlorophyll & Sea Color',
    notifyAfterFailures: 2,
    infraStepPatterns: [],
  },

  'Update wind data.yml': {
    name: 'Update Wind Data',
    notifyAfterFailures: 3,      // Open-Meteo is occasionally flaky
    infraStepPatterns: [],
  },

  'fetch-ocean-dynamics.yml': {
    name: 'Fetch Ocean Dynamics',
    notifyAfterFailures: 2,
    infraStepPatterns: [],
  },

  'fishing-hotspot-analysis.yml': {
    name: 'Fishing Hotspot Analysis',
    notifyAfterFailures: 2,
    infraStepPatterns: [],
  },
}

// Step name patterns that always indicate transient infrastructure noise
// regardless of workflow. Checked case-insensitively.
export const GLOBAL_INFRA_STEP_PATTERNS = [
  /checkout/i,
  /set up python/i,
  /setup python/i,
  /install dep/i,
  /install package/i,
  /upgrade pip/i,
]
