import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const CURVE_API_BASE = "https://prices.curve.finance/v1/chains/fees";

interface CurveChainFees {
  trading_volume: number;
  liquidity_volume: number;
  total_volume: number;
  trading_fees: number;
  liquidity_fees: number;
  total_fees: number;
  fees_to_lp: number;
  fees_to_dao: number;
  fees_to_treasury: number;
  // Yield Basis fees, already inside total_fees/fees_to_lp (those pools have admin_fee = 0).
  // fees/yield-basis reports the same dollars.
  lp_fees_yb: number;
  chain: string;
}

interface CurveFeesResponse {
  start: number;
  end: number;
  aggregated: Omit<CurveChainFees, 'chain'>;
  chains: CurveChainFees[];
}

// Cache the in-flight promise so concurrent calls await the same request
let cachedPromise: { key: string; promise: Promise<CurveFeesResponse> } | null = null;

export async function fetchCurveApiData(startOfDay: number): Promise<CurveFeesResponse> {
  const cacheKey = `${startOfDay}`;

  if (cachedPromise && cachedPromise.key === cacheKey) {
    return cachedPromise.promise;
  }

  // api aggregates over the given [start, end], so pass exact day bounds
  const url = `${CURVE_API_BASE}?start=${startOfDay}&end=${startOfDay + 24 * 3600}`;
  const promise = httpGet(url).catch((err) => {
    // Clear cache on failure so retries can happen
    if (cachedPromise?.key === cacheKey) cachedPromise = null;
    throw err;
  });

  cachedPromise = { key: cacheKey, promise };
  return promise;
}

// Map DefiLlama chain names to Curve API chain names
const chainMap: Record<string, string> = {
  [CHAIN.AVAX]: 'avalanche',
};

export function getChainDataFromApiResponse(response: CurveFeesResponse, chain: string): CurveChainFees | undefined {
  const apiChainName = chainMap[chain] || chain;
  return response.chains.find(c => c.chain.toLowerCase() === apiChainName.toLowerCase());
}
