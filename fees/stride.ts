import { Adapter, FetchV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

/**
 *  Previous implementation used this endpoint:
 *  https://edge.stride.zone/api/${overriddenChain}/stats/fees
 *  This endpoint returns stale data
 **/

// Chain configuration mapping adapter chain names to Stride API identifiers and CoinGecko IDs
interface ChainConfig {
  hostZoneChainId: string; // Used for Polkachu API
  apyChainName: string; // Used for edge.stride.zone APY API
  coingeckoId: string;
  decimals: number;
}

// Only include chains that are currently active on Stride (have host_zone data)
const chainConfigs: { [chain: string]: ChainConfig } = {
  cosmos: {
    hostZoneChainId: "cosmoshub-4",
    apyChainName: "cosmos",
    coingeckoId: "cosmos",
    decimals: 6,
  },
  celestia: {
    hostZoneChainId: "celestia",
    apyChainName: "celestia",
    coingeckoId: "celestia",
    decimals: 6,
  },
  osmosis: {
    hostZoneChainId: "osmosis-1",
    apyChainName: "osmosis",
    coingeckoId: "osmosis",
    decimals: 6,
  },
  dydx: {
    hostZoneChainId: "dydx-mainnet-1",
    apyChainName: "dydx",
    coingeckoId: "dydx-chain",
    decimals: 18,
  },
  juno: {
    hostZoneChainId: "juno-1",
    apyChainName: "juno",
    coingeckoId: "juno-network",
    decimals: 6,
  },
  stargaze: {
    hostZoneChainId: "stargaze-1",
    apyChainName: "stargaze",
    coingeckoId: "stargaze",
    decimals: 6,
  },
  terra: {
    hostZoneChainId: "phoenix-1",
    apyChainName: "terra2",
    coingeckoId: "terra-luna-2",
    decimals: 6,
  },
  evmos: {
    hostZoneChainId: "evmos_9001-2",
    apyChainName: "evmos",
    coingeckoId: "evmos",
    decimals: 18,
  },
  injective: {
    hostZoneChainId: "injective-1",
    apyChainName: "injective",
    coingeckoId: "injective-protocol",
    decimals: 18,
  },
  umee: {
    hostZoneChainId: "umee-1",
    apyChainName: "umee",
    coingeckoId: "umee",
    decimals: 6,
  },
  comdex: {
    hostZoneChainId: "comdex-1",
    apyChainName: "comdex",
    coingeckoId: "comdex",
    decimals: 6,
  },
  islm: {
    hostZoneChainId: "haqq_11235-1",
    apyChainName: "haqq",
    coingeckoId: "islamic-coin",
    decimals: 18,
  },
  band: {
    hostZoneChainId: "laozi-mainnet",
    apyChainName: "band",
    coingeckoId: "band-protocol",
    decimals: 6,
  },
};

interface HostZoneResponse {
  host_zone: {
    total_delegations: string;
    redemption_rate: string;
  };
}

interface ApyResponse {
  apr: number;
  apy: number;
}

const STRIDE_COMMISSION = 0.1; // 10% commission

const createFetch = (chain: string): FetchV2 => {
  return async ({ createBalances }) => {
    const config = chainConfigs[chain];
    if (!config) {
      throw new Error(`Unknown chain: ${chain}`);
    }

    const dailyFees = createBalances();
    const dailyRevenue = createBalances();

    // Fetch host zone data (total delegations and redemption rate)
    let hostZoneData: HostZoneResponse;
    try {
      hostZoneData = await httpGet(
        `https://stride-strd-api.polkachu.com/Stride-Labs/stride/stakeibc/host_zone/${config.hostZoneChainId}`
      );
    } catch (e) {
      // If host zone fetch fails, return 0 (chain might be deprecated or unavailable)
      return { dailyFees, dailyRevenue };
    }

    let apyData: ApyResponse;
    try {
      apyData = await httpGet(
        `https://edge.stride.zone/api/${config.apyChainName}/stats/apy`
      );
    } catch (e) {
      // If APY fetch fails, return 0
      return { dailyFees, dailyRevenue };
    }

    // If APR is null (some chains don't have APY data), return 0
    if (apyData.apr === null || apyData.apr === undefined) {
      return { dailyFees, dailyRevenue };
    }

    // Calculate TVL in underlying tokens
    // total_delegations is in micro-units (e.g., uatom), redemption_rate converts stToken to native
    const totalDelegations = Number(hostZoneData.host_zone.total_delegations);
    const redemptionRate = Number(hostZoneData.host_zone.redemption_rate);
    const tvlInTokens =
      (totalDelegations * redemptionRate) / Math.pow(10, config.decimals);

    // Calculate daily fees in tokens
    // Daily staking rewards = TVL * (APR / 365)
    const apr = apyData.apr;
    const dailyRate = apr / 365;
    const dailyFeesInTokens = tvlInTokens * dailyRate;

    // Revenue is Stride's 10% commission
    const dailyRevenueInTokens = dailyFeesInTokens * STRIDE_COMMISSION;

    dailyFees.addCGToken(config.coingeckoId, dailyFeesInTokens);
    dailyRevenue.addCGToken(config.coingeckoId, dailyRevenueInTokens);

    return { dailyFees, dailyRevenue };
  };
};

const methodology = {
  Fees: "Fees are staking rewards earned by tokens staked with Stride. Calculated as TVL x (APR / 365) where TVL is the total delegations multiplied by the redemption rate, converted to USD.",
  Revenue:
    "Stride collects 10% of liquid staked assets' staking rewards as protocol revenue.",
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.COSMOS]: { fetch: createFetch("cosmos") },
    celestia: { fetch: createFetch("celestia") },
    osmosis: { fetch: createFetch("osmosis") },
    dydx: { fetch: createFetch("dydx") },
    juno: { fetch: createFetch("juno") },
    stargaze: { fetch: createFetch("stargaze") },
    terra: { fetch: createFetch("terra") },
    evmos: { fetch: createFetch("evmos") },
    injective: { fetch: createFetch("injective") },
    umee: { fetch: createFetch("umee") },
    comdex: { fetch: createFetch("comdex") },
    islm: { fetch: createFetch("islm") },
    band: { fetch: createFetch("band") },
  },
  methodology,
};

export default adapter;
