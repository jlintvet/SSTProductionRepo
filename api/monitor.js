/**
 * SST Workflow Monitor
 *
 * Triggered every 15 minutes by cron-job.org (or any HTTP scheduler).
 * For each watched GitHub Actions workflow:
 *   1. Fetches the most recent run
 *   2. Classifies failures as transient or critical
 *   3. Triggers a re-run if transient and below the failure threshold
 *   4. Sends an email alert if critical or threshold exceeded
 *
 * State (retry counts, last seen run IDs) is persisted in Upstash Redis.
 *
 * Required environment variables (set in Vercel dashboard):
 *   GITHUB_TOKEN             — fine-grained PAT, Actions read+write on SSTv2
 *   UPSTASH_REDIS_REST_URL   — from Upstash console
 *   UPSTASH_REDIS_REST_TOKEN — from Upstash console
 *   GMAIL_USER               — your Gmail address (jlintvet@gmail.com)
 *   GMAIL_APP_PASSWORD       — 16-char app password from Google account settings
 *   MONITOR_SECRET           — any random string; protects the endpoint
 */

import { Redis } from '@upstash/redis'
import nodemailer from 'nodemailer'
import { WORKFLOWS, GLOBAL_INFRA_STEP_PATTERNS } from './monitor-config.js'

const OWNER = 'jlintvet'
const REPO  = 'SSTv2'
const ADMIN_EMAIL  = 'jlintvet@gmail.com'
const GITHUB_BASE  = `https://api.github.com/repos/${OWNER}/${REPO}`
const RETRY_GAP_MS = 15 * 60 * 1000   // 15 minutes between retries

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

  if (res.status === 204) return null   // no content (e.g. rerun success)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`GitHub ${path} → ${res.status}: ${body.slice(0, 200)}`)
  }
  return res.json()
}

/** Returns the most recent completed or in-progress run for a workflow file. */
async function getLatestRun(workflowFile) {
  const data = await ghFetch(
    `/actions/workflows/${encodeURIComponent(workflowFile)}/runs?per_page=1&exclude_pull_requests=true`
  )
  return data?.workflow_runs?.[0] ?? null
}

/** Returns the name of the first failed step across all jobs in a run. */
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

/** Triggers a re-run of only the failed jobs in a run. */
async function triggerRerun(runId) {
  await ghFetch(`/actions/runs/${runId}/rerun-failed-jobs`, { method: 'POST' })
}

// ─── Failure classification ───────────────────────────────────────────────────

/**
 * Returns 'transient' | 'critical' | 'skip'
 *
 * transient → retry (e.g. timeout, infra glitch)
 * critical  → alert immediately (e.g. Python error in business logic)
 * skip      → take no action (cancelled, already handled)
 */
function classifyFailure(conclusion, failedStepName, workflowConfig) {
  if (conclusion === 'timed_out')  return 'transient'
  if (conclusion === 'cancelled')  return 'skip'
  if (conclusion !== 'failure')    return 'skip'

  if (failedStepName) {
    const allPatterns = [
      ...GLOBAL_INFRA_STEP_PATTERNS,
      ...(workflowConfig.infraStepPatterns ?? []),
    ]
    if (allPatterns.some(p => p.test(failedStepName))) {
      return 'transient'
    }
  }

  return 'critical'
}

// ─── Email ────────────────────────────────────────────────────────────────────

function getMailer() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,   // 16-char Google App Password
    },
  })
}

async function sendAlert({ workflowName, runUrl, runId, classification, failedStep, consecutiveFailures }) {
  const isRepeated = classification === 'transient'   // transient but threshold exceeded
  const subject = isRepeated
    ? `[SST ALERT] ${workflowName} — Repeated Failures (${consecutiveFailures}x)`
    : `[SST ALERT] ${workflowName} — Critical Failure`

  const headline = isRepeated
    ? `${workflowName} has failed <strong>${consecutiveFailures} consecutive times</strong> despite automatic retries.`
    : `${workflowName} encountered a <strong>critical failure</strong> that cannot be auto-resolved.`

  await getMailer().sendMail({
    from: `"SST Monitor" <${process.env.GMAIL_USER}>`,
    to:   ADMIN_EMAIL,
    subject,
    html: `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;color:#222;max-width:600px;margin:0 auto;padding:24px">
  <h2 style="color:#c0392b">⚠️ SST Monitor Alert</h2>
  <p>${headline}</p>
  <table style="border-collapse:collapse;width:100%;margin:16px 0">
    <tr><td style="padding:6px 12px;background:#f5f5f5;font-weight:bold;width:160px">Workflow</td>
        <td style="padding:6px 12px">${workflowName}</td></tr>
    <tr><td style="padding:6px 12px;background:#f5f5f5;font-weight:bold">Classification</td>
        <td style="padding:6px 12px">${isRepeated ? 'Repeated transient failure' : 'Critical failure'}</td></tr>
    ${failedStep ? `
    <tr><td style="padding:6px 12px;background:#f5f5f5;font-weight:bold">Failed step</td>
        <td style="padding:6px 12px;font-family:monospace">${failedStep}</td></tr>` : ''}
    <tr><td style="padding:6px 12px;background:#f5f5f5;font-weight:bold">Consecutive failures</td>
        <td style="padding:6px 12px">${consecutiveFailures}</td></tr>
    <tr><td style="padding:6px 12px;background:#f5f5f5;font-weight:bold">Run ID</td>
        <td style="padding:6px 12px">${runId}</td></tr>
  </table>
  <p><a href="${runUrl}" style="background:#1a73e8;color:#fff;padding:10px 20px;border-radius:4px;text-decoration:none;display:inline-block">View run on GitHub →</a></p>
  <hr style="margin:24px 0;border:none;border-top:1px solid #ddd">
  <p style="color:#888;font-size:12px">SST Monitor Agent · ${new Date().toISOString()}</p>
</body>
</html>`,
  })
}

// ─── Redis state ──────────────────────────────────────────────────────────────

function getRedis() {
  return new Redis({
    url:   process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  })
}

const REDIS_KEY = (workflowFile) => `sst:monitor:${workflowFile}`

async function getState(redis, workflowFile) {
  return (await redis.hgetall(REDIS_KEY(workflowFile))) ?? {}
}

async function setState(redis, workflowFile, updates) {
  await redis.hset(REDIS_KEY(workflowFile), updates)
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // Protect the endpoint — cron-job.org sends secret in header
  const secret = req.headers['x-monitor-secret'] ?? req.query?.secret
  if (secret !== process.env.MONITOR_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const redis   = getRedis()
  const results = []

  for (const [workflowFile, config] of Object.entries(WORKFLOWS)) {
    const label = config.name

    try {
      // ── 1. Get latest run ────────────────────────────────────────────────
      const run = await getLatestRun(workflowFile)
      if (!run) {
        results.push({ workflow: label, status: 'no_runs' })
        continue
      }

      // ── 2. Skip if run is still in progress ──────────────────────────────
      if (run.status !== 'completed') {
        results.push({ workflow: label, status: run.status, runId: run.id })
        continue
      }

      const state = await getState(redis, workflowFile)
      const lastRunId   = state.lastRunId   ? Number(state.lastRunId)   : null
      const lastRetryAt = state.lastRetryAt ? Number(state.lastRetryAt) : 0
      const consecutiveFailures = Number(state.consecutiveFailures ?? 0)

      // ── 3. Handle success ────────────────────────────────────────────────
      if (run.conclusion === 'success') {
        if (lastRunId !== run.id) {
          // New successful run — clear failure state
          await setState(redis, workflowFile, {
            lastRunId: run.id,
            consecutiveFailures: 0,
            lastRetryAt: 0,
          })
        }
        results.push({ workflow: label, status: 'success', runId: run.id })
        continue
      }

      // ── 4. We have a failure ─────────────────────────────────────────────

      // Same failed run we've already seen — check if we should wait before retrying
      if (lastRunId === run.id) {
        const msSinceRetry = Date.now() - lastRetryAt
        if (msSinceRetry < RETRY_GAP_MS) {
          results.push({ workflow: label, status: 'awaiting_retry', runId: run.id,
            retryInMs: RETRY_GAP_MS - msSinceRetry })
          continue
        }
        // Gap has passed — fall through to classify and act
      }

      // ── 5. Classify the failure ──────────────────────────────────────────
      const failedStep    = await getFirstFailedStep(run.id)
      const classification = classifyFailure(run.conclusion, failedStep, config)

      if (classification === 'skip') {
        await setState(redis, workflowFile, { lastRunId: run.id })
        results.push({ workflow: label, status: 'skipped', runId: run.id })
        continue
      }

      const newConsecutiveFailures = (lastRunId === run.id ? consecutiveFailures : consecutiveFailures + 1)

      // ── 6a. Transient + under threshold → retry ──────────────────────────
      if (classification === 'transient' && newConsecutiveFailures < config.notifyAfterFailures) {
        await triggerRerun(run.id)
        await setState(redis, workflowFile, {
          lastRunId: run.id,
          consecutiveFailures: newConsecutiveFailures,
          lastRetryAt: Date.now(),
        })
        results.push({ workflow: label, status: 'retried', runId: run.id,
          consecutiveFailures: newConsecutiveFailures, failedStep })
        continue
      }

      // ── 6b. Critical or threshold exceeded → alert ───────────────────────
      await sendAlert({
        workflowName: label,
        runUrl: run.html_url,
        runId: run.id,
        classification,
        failedStep,
        consecutiveFailures: newConsecutiveFailures,
      })

      await setState(redis, workflowFile, {
        lastRunId: run.id,
        consecutiveFailures: newConsecutiveFailures,
        lastRetryAt: Date.now(),
        lastNotifiedAt: Date.now(),
      })

      results.push({ workflow: label, status: 'notified', classification,
        runId: run.id, consecutiveFailures: newConsecutiveFailures, failedStep })

    } catch (err) {
      console.error(`[monitor] ${label}:`, err)
      results.push({ workflow: label, status: 'error', error: err.message })
    }
  }

  return res.status(200).json({
    timestamp: new Date().toISOString(),
    results,
  })
}
