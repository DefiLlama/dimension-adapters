import { FetchOptions } from '../../adapters/types'
import { CHAIN } from '../chains'
import axios from 'axios'
import { sleep } from '../../utils/utils'

const endpoint = 'https://li.quest/v2/analytics/transfers'
const integrators = [
  { query: 'DittoNetwork', normalized: 'dittonetwork' },
  { query: 'ditto-app', normalized: 'ditto-app' },
]
// LI.FI's public chain inventory: https://li.quest/v1/chains
const chainIds: Record<string, string> = {
  [CHAIN.ARBITRUM]: '42161',
  [CHAIN.BASE]: '8453',
}

interface LifiTransfer {
  transactionId: string
  status: string
  sending: { amountUSD: string | number; chainId: number; timestamp: number }
  receiving: { chainId: number }
  metadata: { integrator: string }
}
interface LifiResponse {
  data: LifiTransfer[]
  hasNext: boolean
  next?: string | null
}

// Public analytics quota: 100 requests/minute. Leave room for another process
// by spacing this process's requests at least 1.2 seconds apart (<= 50/minute).
// https://help.li.fi/hc/en-us/articles/12111455848859-What-is-the-LI-FI-API-rate-limit
const REQUEST_GAP_MS = 1200
const RATE_LIMIT_WINDOW_MS = 60_000
const MAX_ATTEMPTS = 3 // Initial request and at most two rate-limit retries.
let requestQueue: Promise<unknown> = Promise.resolve()

/** Serialize analytics requests; honor Retry-After on 429, then fail if exhausted. */
function fetchLifiPage(url: string): Promise<LifiResponse> {
  const result = requestQueue.then(async () => {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        // Bound each transport attempt; unrelated failures are not retried here.
        const response = await axios.get<LifiResponse>(url, { timeout: 30_000 })
        return response.data
      } catch (error) {
        if (!axios.isAxiosError(error) || error.response?.status !== 429
          || attempt === MAX_ATTEMPTS - 1) throw error
        const header = error.response.headers['retry-after']
        const raw = header === undefined ? '' : String(header).trim()
        const delay = !raw ? NaN : /^\d+(\.\d+)?$/.test(raw)
          ? Number(raw) * 1000 : Date.parse(raw) - Date.now()
        const retryDelay = Number.isFinite(delay)
          ? Math.max(REQUEST_GAP_MS, delay) : RATE_LIMIT_WINDOW_MS
        // Do not shorten a longer server-requested wait or retry indefinitely.
        if (retryDelay > RATE_LIMIT_WINDOW_MS) throw error
        await sleep(retryDelay)
      }
    }
    throw new Error('LI.FI analytics retry attempts exhausted')
  })
  // Reset the queue after either outcome, without hiding the caller's rejection.
  requestQueue = result.then(() => sleep(REQUEST_GAP_MS), () => sleep(REQUEST_GAP_MS))
  return result
}

/**
 * Sum completed Ditto-attributed LI.FI transfers in an exact half-open window.
 * Count source-side USD once per transfer and separate same/cross-chain routes.
 * Paginate both integrators; malformed responses and upstream errors propagate.
 * @param options Requested source chain, time boundaries and balance factory.
 * @param routeType Whether the destination must match or differ from the source.
 * @returns Completed source-side USD volume for the requested route type.
 */
export async function fetchDittoLifiVolume(
  options: FetchOptions,
  routeType: 'same-chain' | 'cross-chain',
) {
  const chainId = chainIds[options.chain]
  if (!chainId) throw new Error(`Unsupported Ditto LI.FI source chain: ${options.chain}`)
  const volume = options.createBalances()
  const seenTransfers = new Set<string>()

  for (const integrator of integrators) {
    let cursor: string | undefined
    const seenCursors = new Set<string>()
    do {
      const params = new URLSearchParams({
        fromChain: chainId,
        fromTimestamp: options.startTimestamp.toString(),
        toTimestamp: options.endTimestamp.toString(),
        status: 'DONE',
        integrator: integrator.query,
        // Chosen page size to reduce pagination requests, not a claimed API cap.
        // Timestamp filters/cursors: https://docs.li.fi/api-reference/get-a-paginated-list-of-filtered-transfers
        limit: '100',
      })
      if (cursor) params.set('next', cursor)
      const response = await fetchLifiPage(
        `${endpoint}?${params.toString()}`,
      )
      if (!response || !Array.isArray(response.data) || typeof response.hasNext !== 'boolean') {
        throw new Error('LI.FI returned an invalid Ditto analytics response')
      }

      for (const transfer of response.data) {
        if (!transfer.sending || !transfer.receiving) throw new Error('LI.FI transfer has no chain data')
        const sameChain = transfer.sending.chainId === transfer.receiving.chainId
        const matchesType = routeType === 'same-chain' ? sameChain : !sameChain
        const matchesWindow = transfer.sending.timestamp >= options.startTimestamp
          && transfer.sending.timestamp < options.endTimestamp
        const matchesIntegrator = transfer.metadata?.integrator?.toLowerCase() === integrator.normalized
        if (transfer.status !== 'DONE' || !matchesType || !matchesWindow || !matchesIntegrator
          || transfer.sending.chainId !== Number(chainId)) continue

        if (!transfer.transactionId) throw new Error('LI.FI transfer has no transactionId')
        const key = transfer.transactionId.toLowerCase()
        if (seenTransfers.has(key)) continue
        const rawAmount = transfer.sending.amountUSD
        const amountUsd = Number(rawAmount)
        if (rawAmount === null || rawAmount === undefined || rawAmount === ''
          || !Number.isFinite(amountUsd) || amountUsd < 0) {
          throw new Error('LI.FI returned an invalid Ditto transfer amountUSD')
        }
        seenTransfers.add(key)
        volume.addUSDValue(amountUsd)
      }

      if (response.hasNext) {
        if (!response.next || seenCursors.has(response.next)) {
          throw new Error('LI.FI returned an invalid Ditto pagination cursor')
        }
        seenCursors.add(response.next)
        cursor = response.next
      } else cursor = undefined
    } while (cursor)
  }
  return volume
}
