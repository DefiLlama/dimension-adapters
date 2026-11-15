import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

// WheelX chain ID to DefiLlama chain name mapping
const DEFLILLAMA_TO_CHAIN_ID: Record<string, number> = {
  [CHAIN.ETHEREUM]: 1,
  [CHAIN.OPTIMISM]: 10,
  [CHAIN.BSC]: 56,
  [CHAIN.UNICHAIN]: 130,
  [CHAIN.POLYGON]: 137,
  [CHAIN.XLAYER]: 196,
  [CHAIN.FANTOM]: 250,
  [CHAIN.ZKSYNC]: 324,
  [CHAIN.WC]: 480,
  [CHAIN.METIS]: 1462,
  [CHAIN.POLYGON_ZKEVM]: 1101,
  [CHAIN.MOONBEAM]: 1284,
  [CHAIN.MOONRIVER]: 1285,
  [CHAIN.SEI]: 1329,
  [CHAIN.SONEIUM]: 1868,
  [CHAIN.RONIN]: 2020,
  [CHAIN.MANTLE]: 5000,
  [CHAIN.ZETA]: 7000,
  [CHAIN.BASE]: 8453,
  [CHAIN.ARBITRUM]: 42161,
  [CHAIN.ARBITRUM_NOVA]: 42170,
  [CHAIN.CELO]: 42220,
  [CHAIN.AVAX]: 43114,
  [CHAIN.LINEA]: 59144,
  [CHAIN.BLAST]: 81457,
  [CHAIN.SCROLL]: 534352,
  [CHAIN.INK]: 57073,
  [CHAIN.ZORA]: 7777777,
  [CHAIN.SOLANA]: 1151111081099710,
};

// WheelX API base URL (production)
const WHEELX_API_BASE = "https://api.wheelx.fi/v1";

interface WheelXOrder {
  order_id: string;
  from_chain: number;
  to_chain: number;
  from_token: string;
  to_token: string;
  from_amount: string;
  to_amount: string;
  order_value: string;
  status: string;
  from_token_info?: {
    address: string;
    symbol: string;
    decimals: number;
  } | null;
  to_token_info?: {
    address: string;
    symbol: string;
    decimals: number;
  } | null;
}

interface OrdersResponse {
  orders: WheelXOrder[];
  total: number;
}

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances();

  const startDate = new Date(options.startTimestamp * 1000).toISOString();
  const endDate = new Date(options.endTimestamp * 1000).toISOString();

  const chainId = DEFLILLAMA_TO_CHAIN_ID[options.chain];

  const params = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
    limit: "500",
  });
  if (chainId !== null) {
    params.append("from_chain", String(chainId));
  }

  const url = `${WHEELX_API_BASE}/orders?${params.toString()}`;
  const data: OrdersResponse = await fetchURL(url);

  // a failed or partial response must not be stored as a $0 day for this chain
  if (!Array.isArray(data?.orders) || !Number.isInteger(data.total)) throw new Error(`WheelX returned a malformed orders response for ${options.chain}`);
  if (data.total > data.orders.length) throw new Error(`WheelX returned ${data.orders.length} of ${data.total} orders for ${options.chain}`);

  for (const order of data.orders) {
    if ((order.from_chain !== order.to_chain) || (order.status !== 'Filled')) continue;
    dailyVolume.add(order.from_token, Number(order.from_amount));
  }

  return { dailyVolume };
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: Object.keys(DEFLILLAMA_TO_CHAIN_ID),
  start: "2025-04-01",
};

export default adapter;
