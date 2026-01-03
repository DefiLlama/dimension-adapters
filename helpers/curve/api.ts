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
  chain: string;
}

interface CurveFeesResponse {
  start: number;
  end: number;
  aggregated: Omit<CurveChainFees, 'chain'>;
  chains: CurveChainFees[];
}

// Cache for API response (keyed by start-end)
let cachedResponse: { key: string; data: CurveFeesResponse } | null = null;

export async function fetchCurveApiData(startTimestamp: number, endTimestamp: number): Promise<CurveFeesResponse> {
  const cacheKey = `${startTimestamp}-${endTimestamp}`;

  if (cachedResponse && cachedResponse.key === cacheKey) {
    return cachedResponse.data;
  }

  const url = `${CURVE_API_BASE}?start=${startTimestamp}&end=${endTimestamp}`;
  const response = await httpGet(url);

  cachedResponse = { key: cacheKey, data: response };
  return response;
}

// Map DefiLlama chain names to Curve API chain names
const chainMap: Record<string, string> = {
  'avax': 'avalanche',
};

export function getChainDataFromApiResponse(response: CurveFeesResponse, chain: string): CurveChainFees | undefined {
  const apiChainName = chainMap[chain] || chain;
  return response.chains.find(c => c.chain.toLowerCase() === apiChainName.toLowerCase());
}
