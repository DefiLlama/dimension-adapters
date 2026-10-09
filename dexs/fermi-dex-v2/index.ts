import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

// Phase 2 fills settle on Solana program FRMiX94PWHbndvySq8xyRx185GvPeggUeKaLmZgVdd4.
// Sample-check API rows with verify-trace.ts before changing the source or units.
const VOLUME_ENDPOINT = 'https://v1.fermi.trade/api/volume';

interface Fill {
  id: string;
  ts_ms: number;
  taker_side: 'bid' | 'ask';
  execution_quote_ui: number | string | null;
}

interface VolumeResponse {
  start_timestamp: number;
  end_timestamp: number;
  cursor: number;
  next_cursor: number | null;
  count: number;
  fills: Fill[];
  sources?: {
    harness_ok: boolean;
    audit_load_error: string | null;
    audit_save_error: string | null;
  };
}

const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
  // runAdapter sets fromTimestamp one second before the requested window.
  // Normalize it to the half-open API interval so hourly pulls do not overlap.
  const startTimestamp = options.fromTimestamp + 1;
  let cursor = 0;
  let dailyVolume = 0;
  const seen = new Set<string>();

  while (true) {
    const response: VolumeResponse = await httpGet(VOLUME_ENDPOINT, {
      params: {
        start_timestamp: startTimestamp,
        end_timestamp: options.endTimestamp,
        trace: 1,
        limit: 1000,
        cursor,
      },
    });

    if (response.start_timestamp !== startTimestamp || response.end_timestamp !== options.endTimestamp || response.cursor !== cursor) {
      throw new Error('Fermi volume API returned a different time window or cursor');
    }
    if (!Array.isArray(response.fills) || response.count !== response.fills.length) {
      throw new Error('Fermi volume API returned an incomplete fill page');
    }
    if (response.sources && (!response.sources.harness_ok || response.sources.audit_load_error || response.sources.audit_save_error)) {
      throw new Error('Fermi volume API reported an ingestion error');
    }

    for (const fill of response.fills) {
      if (!fill.id || seen.has(fill.id) || !Number.isFinite(fill.ts_ms) || !['bid', 'ask'].includes(fill.taker_side)) {
        throw new Error('Fermi volume API returned an invalid or duplicate fill');
      }
      seen.add(fill.id);
      // Keep adjacent hourly windows disjoint even if the API includes the end boundary.
      if (fill.ts_ms < startTimestamp * 1000 || fill.ts_ms >= options.endTimestamp * 1000) continue;

      // The aggregate volume fields use a separate stable-price valuation.
      // Count execution notional, not volume_quote_ui or the reported dailyVolume.
      const quote = fill.execution_quote_ui;
      if (quote === null || quote === undefined || (typeof quote === 'string' && quote.trim() === '')) {
        throw new Error('Fermi fill is missing its execution quote amount');
      }
      const volume = Number(quote);
      if (!Number.isFinite(volume) || volume < 0) {
        throw new Error('Fermi fill has an invalid execution quote amount');
      }
      dailyVolume += volume;
    }

    if (response.next_cursor === null) break;
    if (!Number.isSafeInteger(response.next_cursor) || response.next_cursor <= cursor) {
      throw new Error('Fermi volume API returned a non-advancing cursor');
    }
    cursor = response.next_cursor;
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.SOLANA],
  start: "2026-08-14",
  fetch,
  methodology: {
    Volume: "USDC execution quote amounts of perpetual fills returned by Fermi's monitoring API, counted once per fill ID; excludes the API's stable-price volume valuation.",
  },
};

export default adapter;
