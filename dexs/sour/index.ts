import { FetchOptions, FetchResult } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

/**
 * Sour Finance — Solana perp DEX with batch clearing.
 *
 * Daily volume is the sum of fill notional emitted by the Sour program
 * (souryQgnM1xiNuGcmVYLPGT3MKqnGN8QTqP8zk8eape) across the UTC day,
 * read per-market from the Sour BFF's windowed volume endpoint. The
 * endpoint scans on-chain `upsert_position` instructions over the
 * requested [from, to) window and sums their notionals — same path
 * used by the live Markets-page UI.
 *
 * Fees are 3 bps flat per fill, 100% routed to the SOUR LP vault — so
 * dailyFees = dailyVolume × 0.0003 and dailyRevenue = 0 (the protocol
 * itself claims none).
 */
const FEE_BPS = 0.0003;

const MARKET_PDAS: string[] = [
  '64Tv5ZwQi5zHDTtnMt8ymcmJ6oUHkgdehPZDXsfrHtE5', // SOL-USD
  'D17rGDPwvNHRScGVxhU3vmwRJVbCLcg45iWur1vX4bDH', // BTC-USD
  '6vhdtLWxifiojEAKX1DUARzSbvVM5VhP7pYZt9GdjVyP', // ETH-USD
];

const BFF = 'https://app.sour.finance/api';

interface VolumePayload {
  volumeMicros?: string;
}

async function fetchMarketVolume(
  market: string,
  fromTs: number,
  toTs: number,
): Promise<number> {
  const url = `${BFF}/markets/${market}/volume?from=${fromTs}&to=${toTs}`;
  try {
    const json = (await httpGet(url)) as VolumePayload;
    if (!json || typeof json.volumeMicros !== 'string') return 0;
    return Number(json.volumeMicros) / 1_000_000;
  } catch {
    return 0;
  }
}

const fetch = async (
  _t: number,
  _c: any,
  options: FetchOptions,
): Promise<FetchResult> => {
  const start = options.startTimestamp;
  const end = options.endTimestamp;

  let dailyVolume = 0;
  for (const m of MARKET_PDAS) {
    dailyVolume += await fetchMarketVolume(m, start, end);
  }

  const dailyFees = dailyVolume * FEE_BPS;

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: 0,
    dailySupplySideRevenue: dailyFees,
    dailyHoldersRevenue: dailyFees,
  };
};

const adapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2026-05-06',
  meta: {
    methodology: {
      Volume:
        'Sum of fill notional in USDC across all SOL-USD, BTC-USD, ETH-USD perpetual markets, read from the Sour BFF volume endpoint over the [start, end) UTC-day window. The endpoint scans on-chain upsert_position instructions emitted by the Sour program at souryQgnM1xiNuGcmVYLPGT3MKqnGN8QTqP8zk8eape.',
      Fees: '3 basis points (0.0003) × daily volume. Flat per-fill rate, no taker/maker split, no tier ladder.',
      Revenue:
        '0. The Sour protocol does not claim any portion of the fee — 100% routes to the SOUR LP vault.',
      SupplySideRevenue:
        '100% of fees. The LP vault is the economic owner of the protocol; LPs receive all fee flow.',
      HoldersRevenue:
        'Equivalent to supply-side revenue. There is no separate token-holder distribution.',
    },
  },
};

export default adapter;
