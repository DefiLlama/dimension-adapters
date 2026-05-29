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

const WHEELX_API_BASE = "https://api.wheelx.fi/v1";

// All chains WheelX operates on
const CHAINS = [
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

const DEFILLAMA_TO_CHAIN_ID: Record<string, number> = {};
for (const [wheelxId, dlName] of Object.entries(CHAIN_ID_TO_DEFLILLAMA)) {
  DEFILLAMA_TO_CHAIN_ID[dlName] = Number(wheelxId);
}

interface OrderStatsResponse {
  stats: {
    total_volume_usd: string;
    total_order_count: number;
    total_fees_usd: string;
    total_points_awarded: string;
    volume_by_chain: Record<string, string>;
    order_count_by_bridge: Record<string, number>;
    period_start: string | null;
    period_end: string | null;
  };
}

/**
 * Fees adapter for WheelX — a cross-chain bridge aggregator.
 *
 * Fee structure:
 * - WheelX charges bridge fees + swap fees on each cross-chain transaction
 * - Fees are denominated in the source token
 * - The protocol keeps ~30% of fees as revenue, ~70% goes to LPs/integrators (supply side)
 * - Discounts may apply for certain users/chains
 *
 * Fee sources documented in app.py `price_impact` field:
 * - bridge_fee: fee for bridging across chains
 * - swap_fee: fee for token swapping
 * - dst_gas_fee: gas cost on destination chain (not kept by protocol)
 */
async function fetchFees(options: FetchOptions, chainId: number | null) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const startDate = new Date(options.startTimestamp * 1000).toISOString();
  const endDate = new Date(options.endTimestamp * 1000).toISOString();

  try {
    // Fetch aggregated statistics from the WheelX API
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
    });
    if (chainId !== null) {
      params.append("from_chain", String(chainId));
    }

    const url = `${WHEELX_API_BASE}/orders/stats?${params.toString()}`;
    const data: OrderStatsResponse = await httpGet(url);

    if (!data?.stats) {
      console.warn(`No stats data for chain ${chainId}`);
      return { dailyFees, dailyRevenue, dailySupplySideRevenue };
    }

    const stats = data.stats;
    const totalFees = parseInt(stats.total_fees_usd, 10);

    if (totalFees > 0) {
      // All fees collected by the protocol (gross protocol revenue)
      // WheelX fees = bridge_fee + swap_fee
      dailyFees.addGasToken(totalFees);

      // Revenue is the portion the protocol keeps (after discounts)
      // Default discount is 100% meaning no revenue, but typically ~30% after discounts
      const estimatedRevenue = Math.floor(totalFees * 30 / 100);
      dailyRevenue.addGasToken(estimatedRevenue);

      // Supply side revenue goes to bridge operators, integrators, LPs
      const estimatedSupplySide = totalFees - estimatedRevenue;
      dailySupplySideRevenue.addGasToken(estimatedSupplySide);
    }

    return { dailyFees, dailyRevenue, dailySupplySideRevenue };
  } catch (error) {
    console.error(`Error fetching fees for chain ${chainId}:`, error);
    return { dailyFees, dailyRevenue, dailySupplySideRevenue };
  }
}

const buildFetch = (chainId: number | null) => async (options: FetchOptions) =>
  fetchFees(options, chainId);

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    ...Object.fromEntries(
      CHAINS.map((chain) => {
        const wheelxChainId = DEFILLAMA_TO_CHAIN_ID[chain] ?? null;
        return [
          chain,
          {
            fetch: buildFetch(wheelxChainId),
            start: "2024-10-01",
          },
        ];
      })
    ),
  },
  feeReduction: "WheelX applies fee discounts based on user tier and chain pairs. Fees can be reduced by up to 100% for certain users. The reported fees represent the gross amount before discounts.",
  methodology: {
    Fees: {
      "Bridge Fees": "Fees charged for cross-chain bridging operations, denominated in the source token",
      "Swap Fees": "Fees charged for token swaps on the destination chain",
    },
    Revenue: {
      "Protocol Revenue": "The portion of fees retained by WheelX after discounts (estimated at 30% of gross fees)",
    },
    SupplySideRevenue: {
      "LP & Integrator Fees": "Portion of fees distributed to liquidity providers, integrators, and bridge operators (estimated at 70% of gross fees)",
    },
  },
  breakdownData: {
    breakdownMethodology: {
      Fees: {
        "Bridge Fees": "Fees from bridge operations",
        "Swap Fees": "Fees from swap operations",
      },
      Revenue: {
        "Protocol Revenue": "Fees retained by WheelX protocol",
      },
      SupplySideRevenue: {
        "LP & Integrator Fees": "Fees distributed to supply side",
      },
    },
  },
};

export default adapter;
