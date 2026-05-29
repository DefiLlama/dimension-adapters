import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

// WheelX chain ID to DefiLlama chain name mapping
const CHAIN_ID_TO_DEFLILLAMA: Record<number, string> = {
  1: CHAIN.ETHEREUM,
  10: CHAIN.OPTIMISM,
  56: CHAIN.BSC,
  130: CHAIN.UNICHAIN,
  137: CHAIN.POLYGON,
  196: CHAIN.XLAYER,
  250: CHAIN.FANTOM,
  324: CHAIN.ZKSYNC,
  480: CHAIN.WC,
  1088: CHAIN.METIS,
  1101: CHAIN.POLYGON_ZKEVM,
  1284: CHAIN.MOONBEAM,
  1285: CHAIN.MOONRIVER,
  1329: CHAIN.SEI,
  1462: CHAIN.METIS,
  1868: CHAIN.SONEIUM,
  2020: CHAIN.RONIN,
  5000: CHAIN.MANTLE,
  7000: CHAIN.ZETA,
  8453: CHAIN.BASE,
  42161: CHAIN.ARBITRUM,
  42170: CHAIN.ARBITRUM_NOVA,
  42220: CHAIN.CELO,
  43114: CHAIN.AVAX,
  59144: CHAIN.LINEA,
  81457: CHAIN.BLAST,
  534352: CHAIN.SCROLL,
  57073: CHAIN.INK,
  7777777: CHAIN.ZORA,
  1151111081099710: CHAIN.SOLANA,
};

// WheelX API base URL (production)
const WHEELX_API_BASE = "https://api.wheelx.fi/v1";

// All chains WheelX operates on (mainnet)
const SUPPORTED_CHAINS = [
  CHAIN.ETHEREUM,
  CHAIN.ARBITRUM,
  CHAIN.BASE,
  CHAIN.OPTIMISM,
  CHAIN.BSC,
  CHAIN.POLYGON,
  CHAIN.LINEA,
  CHAIN.SCROLL,
  CHAIN.AVAX,
  CHAIN.MANTLE,
  CHAIN.CELO,
  CHAIN.FANTOM,
  CHAIN.ZKSYNC,
  CHAIN.BLAST,
  CHAIN.ZORA,
  CHAIN.UNICHAIN,
  CHAIN.SONEIUM,
  CHAIN.INK,
  CHAIN.WC,
  CHAIN.MOONBEAM,
  CHAIN.METIS,
  CHAIN.ZETA,
  CHAIN.POLYGON_ZKEVM,
  CHAIN.ARBITRUM_NOVA,
  CHAIN.RONIN,
  CHAIN.XLAYER,
  CHAIN.SOLANA,
  CHAIN.SEI,
];

// Reverse mapping
const DEFILLAMA_TO_CHAIN_ID: Record<string, number> = {};
for (const [wheelxId, dlName] of Object.entries(CHAIN_ID_TO_DEFLILLAMA)) {
  DEFILLAMA_TO_CHAIN_ID[dlName] = Number(wheelxId);
}

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

/**
 * Fetch WheelX order data from the /orders endpoint.
 * Returns daily volume per the aggregator guidelines.
 */
async function fetchWheelxData(options: FetchOptions, chainId: number | null) {
  const dailyVolume = options.createBalances();

  const startDate = new Date(options.startTimestamp * 1000).toISOString();
  const endDate = new Date(options.endTimestamp * 1000).toISOString();

  try {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
      limit: "500",
    });
    if (chainId !== null) {
      params.append("from_chain", String(chainId));
    }

    const url = `${WHEELX_API_BASE}/orders?${params.toString()}`;
    const data: OrdersResponse = await httpGet(url);

    if (data?.orders?.length) {
      for (const order of data.orders) {
        const value = parseFloat(order.order_value);
        if (value > 0) {
          dailyVolume.addUSDValue(value);
        }
      }
    }

    return { dailyVolume };
  } catch (error) {
    console.error(`Error fetching WheelX data for chain ${chainId}:`, error);
    return { dailyVolume };
  }
}

const buildFetch =
  (chainId: number | null) =>
  async (options: FetchOptions) => {
    return fetchWheelxData(options, chainId);
  };

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    ...Object.fromEntries(
      SUPPORTED_CHAINS.map((chain) => {
        const wheelxChainId = DEFILLAMA_TO_CHAIN_ID[chain] ?? null;
        return [
          chain,
          {
            fetch: buildFetch(wheelxChainId),
            start: "2025-04-01", // WheelX mainnet launch
          },
        ];
      })
    ),
  },
};

export default adapter;
