import { FetchOptions } from '../adapters/types'
import { httpGet } from '../utils/fetchURL'

const NEONY_STATS_ENDPOINT = 'https://api.mainnet.neony.exchange/v1/get_exchange_stats_history'

export interface NeonyStatsApiQueryParams {
  olderTimestampMs: number
  newerTimestampMs: number
}

export interface NeonyStatsHistoryEntry {
  timestampOpen: number | string
  timestampClose: number | string
  perpVolumeUsd: number | string
  spotVolumeUsd: number | string
  openInterestUsd: number | string
}

export interface NeonyStatsApiEnvelope {
  data: NeonyStatsHistoryEntry[]
  paginationCursor?: unknown
}

export interface NeonyStats {
  perpDailyVolumeUsd: number
  spotDailyVolumeUsd: number
  openInterestUsd: number
}

function toNumber(value: number | string, field: string): number {
  if (typeof value === 'string' && value.trim() === '') {
    throw new Error(`Invalid ${field} in Neony stats response: empty or whitespace-only string`)
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${field} in Neony stats response: ${value}`)
  }
  return parsed
}

function parseResponse(response: any, params: NeonyStatsApiQueryParams): NeonyStats {
  const payload = response?.data

  if (!Array.isArray(payload)) {
    throw new Error('Invalid Neony stats response: expected data array')
  }

  const matchingEntries = payload.filter(
    (entry: NeonyStatsHistoryEntry) =>
      entry &&
      typeof entry === 'object' &&
      String(entry.timestampOpen) === String(params.olderTimestampMs) &&
      String(entry.timestampClose) === String(params.newerTimestampMs)
  )

  if (matchingEntries.length !== 1) {
    throw new Error(
      `Invalid Neony stats response: expected exactly one entry for ${params.olderTimestampMs}-${params.newerTimestampMs}, got ${matchingEntries.length}`
    )
  }

  const [entry] = matchingEntries
  const requiredFields = ['perpVolumeUsd', 'spotVolumeUsd', 'openInterestUsd'] as const

  for (const field of requiredFields) {
    if (entry[field] === undefined || entry[field] === null) {
      throw new Error(`Invalid Neony stats response: missing ${field}`)
    }
  }

  return {
    perpDailyVolumeUsd: toNumber(entry.perpVolumeUsd, 'perpVolumeUsd'),
    spotDailyVolumeUsd: toNumber(entry.spotVolumeUsd, 'spotVolumeUsd'),
    openInterestUsd: toNumber(entry.openInterestUsd, 'openInterestUsd')
  }
}

export async function fetchNeonyStats(options: FetchOptions): Promise<NeonyStats> {
  const params: NeonyStatsApiQueryParams = {
    // DefiLlama daily runs start one second before the actual UTC day boundary.
    olderTimestampMs: (options.startOfDay) * 1000,
    newerTimestampMs: (options.startOfDay + (24 * 60 * 60)) * 1000 - 1
  }
  const query = new URLSearchParams({
    olderTimestampMs: String(params.olderTimestampMs),
    newerTimestampMs: String(params.newerTimestampMs)
  })

  const response: NeonyStatsApiEnvelope = await httpGet(
    `${NEONY_STATS_ENDPOINT}?${query.toString()}`
  )
  return parseResponse(response, params)
}
