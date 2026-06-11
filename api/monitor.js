/**
 * SST Workflow Monitor v1.1
 *
 * No third-party SDK imports — uses only Node.js built-in fetch.
 * State is persisted via Upstash Redis REST API directly.
 * Email is sent via Gmail SMTP using a dynamic nodemailer import.
 *
 * Required environment variables (Vercel dashboard):
 *   GITHUB_TOKEN             — fine-grained PAT, Actions read+write on SSTv2
 *   UPSTASH_REDIS_REST_URL   — e.g. https://xxx.upstash.io
 *   UPSTASH_REDIS_REST_TOKEN — long token from Upstash console
 *   GMAIL_USER               — jlintvet@gmail.com
 *   GMAIL_APP_PASSWORD       — 16-char Google App Password
 *   MONITOR_SECRET           — protects this endpoint
 */

import { WORKFLOWS, GLOBAL_INFRA_STEP_PATTERNS } from './monitor-config.js'

const OWNER        = 'jlintvet'
const REPO         = 'SSTv2'
const ADMIN_EMAIL  = 'jlintvet@gmail.com'
const GITHUB_BASE  = `https://api.github.com/repos/${OWNER}/${REPO}`
const RETRY_GAP_MS = 15 * 60 * 1000

// ─── GitHub helpers ───────────────────────────────────────────────────────────

async function ghFetch(path, options = {}) {
  const res = await fetch(`${GITHUB_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers ?? {}),
    },
  })
  if (res.status === 204) return null
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`GitHub ${path} → ${res.status}: ${body.slice(0, 200)}`)
  }
  return res.json()
}

async function getLatestRun(workflowFile) {
  const data = await ghFetch(
    `/actions/workflows/${encodeURIComponent(workflowFile)}/runs?per_page=1&exclude_pull_requests=true`
  )
  return data?.workflow_runs?.[0] ?? null
}

async function getFirstFailedStep(runId) {
  const data = await ghFetch(`/actions/runs/${runId}/jobs`)
  for (const job of data?.jobs ?? []) {
    if (job.conclusion === 'failure') {
      for (const step of job.steps ?? []) {
        if (step.conclusion === 'failure') return step.name
      }
    }
  }
  return null
}

async function triggerRerun(runId) {
  await ghFetch(`/actions/runs/${runId}/rerun-failed-jobs`, { method: 'POST' })
}

// ─── Failure classification ───────────────────────────────────────────────────

function classifyFailure(conclusion, failedStepName, workflowConfig) {
  if (conclusion === 'timed_out')  return 'transient'
  if (conclusion === 'cancelled')  return 'skip'
  if (conclusion !== 'failure')    return 'skip'

  if (failedStepName) {
    const allPatterns = [
      ...GLOBAL_INFRA_STEP_PATTERNS,
      ...(workflowConfig.infraStepPatterns ?? []),
    ]
    if (allPatterns.some(p => p.test(failedStepName))) return 'transient'
  }
  return 'critical'
}

// ─── Email ────────────────────────────────────────────────────────────────────

async function sendAlert({ workflowName, runUrl, runId, classification, failedStep, consecutiveFailures }) {
  const { default: nodemailer } = await import('nodemailer')
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  })

  const isRepeated = classification === 'transient'
  const subject = isRepeated
    ? `[SST ALERT] ${workflowName} — Repeated Failures (${consecutiveFailures}x)`
    : `[SST ALERT] ${workflowName} — Critical Failure`

  await transporter.sendMail({
    from: `"SST Monitor" <${process.env.GMAIL_USER}>`,
    to: ADMIN_EMAIL,
    subject,
    html: `
<body style="font-family:sans-serif;color:#222;max-width:600px;margin:0 auto;padding:24px">
  <h2 style="color:#c0392b">⚠️ SST Monitor Alert</h2>
  <p>${isRepeated
    ? `${workflowName} has failed <strong>${consecutiveFailures} consecutive times</strong> despite retries.`
    : `${workflowName} encountered a <strong>critical failure</strong> requiring manual action.`
  }</p>
  <table style="border-collapse:collapse;width:100%;margin:16px 0">
    <tr><td style="padding:6px 12px;background:#f5f5f5;font-weight:bold;width:160px">Workflow</td>
        <td style="padding:6px 12px">${workflowName}</td></tr>
    <tr><td style="padding:6px 12px;background:#f5f5f5;font-weight:bold">Type</td>
        <td style="padding:6px 12px">${isRepeated ? 'Repeated transient failure' : 'Critical failure'}</td></tr>
    ${failedStep ? `<tr><td style="padding:6px 12px;background:#f5f5f5;font-weight:bold">Failed step</td>
        <td style="padding:6px 12px;font-family:monospace">${failedStep}</td></tr>` : ''}
    <tr><td style="padding:6px 12px;background:#f5f5f5;font-weight:bold">Consecutive failures</td>
        <td style="padding:6px 12px">${consecutiveFailures}</td></tr>
    <tr><td style="padding:6px 12px;background:#f5f5f5;font-weight:bold">Run ID</td>
        <td style="padding:6px 12px">${runId}</td></tr>
  </table>
  <p><a href="${runUrl}" style="background:#1a73e8;color:#fff;padding:10px 20px;border-radius:4px;text-decoration:none;display:inline-block">View run on GitHub →</a></p>
  <p style="color:#888;font-size:12px;margin-top:24px">SST Monitor · ${new Date().toISOString()}</p>
</body>`,
  })
}

// ─── Upstash Redis (direct REST — no SDK) ────────────────────────────────────

async function redisCmd(...args) {
  const res = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  })
  const json = await res.json()
  if (json.error) throw new Error(`Redis error: ${json.error}`)
  return json.result
}

const REDIS_KEY = (wf) => `sst:monitor:${wf}`

async function getState(workflowFile) {
  const result = await redisCmd('HGETALL', REDIS_KEY(workflowFile))
  if (!result || result.length === 0) return {}
  const obj = {}
  for (let i = 0; i < result.length; i += 2) obj[result[i]] = result[i + 1]
  return obj
}

async function setState(workflowFile, updates) {
  const args = ['HSET', REDIS_KEY(workflowFile)]
  for (const [k, v] of Object.entries(updates)) args.push(k, String(v))
  await redisCmd(...args)
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  try {
    const secret = req.headers['x-monitor-secret'] ?? req.query?.secret
    if (secret !== process.env.MONITOR_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const results = []

    for (const [workflowFile, config] of Object.entries(WORKFLOWS)) {
      const label = config.name
      try {
        // 1. Get latest run
        const run = await getLatestRun(workflowFile)
        if (!run) { results.push({ workflow: label, status: 'no_runs' }); continue }

        // 2. Skip if still running
        if (run.status !== 'completed') {
          results.push({ workflow: label, status: run.status, runId: run.id }); continue
        }

        const state = await getState(workflowFile)
        const lastRunId            = state.lastRunId   ? Number(state.lastRunId)   : null
        const lastRetryAt          = state.lastRetryAt ? Number(state.lastRetryAt) : 0
        const consecutiveFailures  = Number(state.consecutiveFailures ?? 0)

        // 3. Success
        if (run.conclusion === 'success') {
          if (lastRunId !== run.id) {
            await setState(workflowFile, { lastRunId: run.id, consecutiveFailures: 0, lastRetryAt: 0 })
          }
          results.push({ workflow: label, status: 'success', runId: run.id }); continue
        }

        // 4. Same failed run — check retry gap
        if (lastRunId === run.id) {
          if (Date.now() - lastRetryAt < RETRY_GAP_MS) {
            results.push({ workflow: label, status: 'awaiting_retry', runId: run.id }); continue
          }
        }

        // 5. Classify
        const failedStep     = await getFirstFailedStep(run.id)
        const classification = classifyFailure(run.conclusion, failedStep, config)

        if (classification === 'skip') {
          await setState(workflowFile, { lastRunId: run.id })
          results.push({ workflow: label, status: 'skipped', runId: run.id }); continue
        }

        const newFailures = lastRunId === run.id ? consecutiveFailures : consecutiveFailures + 1

        // 6a. Transient + under threshold → retry
        if (classification === 'transient' && newFailures < config.notifyAfterFailures) {
          await triggerRerun(run.id)
          await setState(workflowFile, { lastRunId: run.id, consecutiveFailures: newFailures, lastRetryAt: Date.now() })
          results.push({ workflow: label, status: 'retried', runId: run.id, consecutiveFailures: newFailures, failedStep }); continue
        }

        // 6b. Critical or threshold → alert
        await sendAlert({ workflowName: label, runUrl: run.html_url, runId: run.id, classification, failedStep, consecutiveFailures: newFailures })
        await setState(workflowFile, { lastRunId: run.id, consecutiveFailures: newFailures, lastRetryAt: Date.now(), lastNotifiedAt: Date.now() })
        results.push({ workflow: label, status: 'notified', classification, runId: run.id, consecutiveFailures: newFailures, failedStep })

      } catch (err) {
        console.error(`[monitor] ${label}:`, err.message)
        results.push({ workflow: label, status: 'error', error: err.message })
      }
    }

    return res.status(200).json({ timestamp: new Date().toISOString(), results })

  } catch (fatal) {
    console.error('[monitor] FATAL:', fatal)
    return res.status(500).json({ fatal: fatal.message, stack: fatal.stack })
  }
}
