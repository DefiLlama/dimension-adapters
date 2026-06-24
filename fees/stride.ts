import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import fetchURL from "../utils/fetchURL";

// Stride is a multichain liquid-staking protocol. Native tokens delegated through Stride
// earn the host chain's staking rewards; Stride keeps a 10% commission and passes the
// remaining 90% to stToken holders via redemption-rate appreciation.
// "Stride's 10% fee is only applied to rewards you earn." — docs.stride.zone
//
// The previous data source (stride-fees-production.up.railway.app) is dead — it returns
// HTTP 502 and the adapter reported 0 fees for every chain. We replace it with the
// on-chain delegated balance (Stride stakeibc LCD) priced via the host chain's live
// staking APR (Stride app API), which reproduces the protocol's daily reward run-rate.
const STRIDE_FEE = 0.1;

const HOST_ZONE_API = (hostChainId: string) =>
  `https://stride-api.polkachu.com/Stride-Labs/stride/stakeibc/host_zone/${hostChainId}`;
const STAKE_STATS_API = "https://edge.stride.zone/api/stake-stats";

// repo chain -> Stride host zone.
//   hostChainId : on-chain host_zone.chain_id used by the stakeibc LCD
//   statsName   : `name` field in stake-stats (gross staking APR source)
//   cg          : DefiLlama coingecko id for the host token
//   decimals    : host token decimals (u-prefixed denoms = 6, a-prefixed / inj = 18)
const config: Record<string, { hostChainId: string; statsName: string; cg: string; decimals: number }> = {
  [CHAIN.COSMOS]: { hostChainId: "cosmoshub-4", statsName: "cosmos", cg: "cosmos", decimals: 6 },
  [CHAIN.CELESTIA]: { hostChainId: "celestia", statsName: "celestia", cg: "celestia", decimals: 6 },
  [CHAIN.OSMOSIS]: { hostChainId: "osmosis-1", statsName: "osmosis", cg: "osmosis", decimals: 6 },
  [CHAIN.JUNO]: { hostChainId: "juno-1", statsName: "juno", cg: "juno-network", decimals: 6 },
  [CHAIN.TERRA]: { hostChainId: "phoenix-1", statsName: "terra2", cg: "terra-luna-2", decimals: 6 },
  [CHAIN.EVMOS]: { hostChainId: "evmos_9001-2", statsName: "evmos", cg: "evmos", decimals: 18 },
  [CHAIN.INJECTIVE]: { hostChainId: "injective-1", statsName: "injective", cg: "injective-protocol", decimals: 18 },
  [CHAIN.HAQQ]: { hostChainId: "haqq_11235-1", statsName: "haqq", cg: "islamic-coin", decimals: 18 },
  dydx: { hostChainId: "dydx-mainnet-1", statsName: "dydx", cg: "dydx-chain", decimals: 18 },
  band: { hostChainId: "laozi-mainnet", statsName: "band", cg: "band-protocol", decimals: 6 },
  stargaze: { hostChainId: "stargaze-1", statsName: "stargaze", cg: "stargaze", decimals: 6 },
};

const fetch = async (options: FetchOptions) => {
  const { hostChainId, statsName, cg, decimals } = config[options.chain];

  // Native tokens actively delegated through Stride for this host zone (on-chain).
  const { host_zone } = await fetchURL(HOST_ZONE_API(hostChainId));
  const totalDelegations = Number(host_zone.total_delegations) / 10 ** decimals;

  // Host chain's gross staking APR (before Stride's 10% fee), from Stride's live app API.
  const { stats } = await fetchURL(STAKE_STATS_API);
  const stat = stats.find((s: any) => s.name === statsName);
  if (!stat) throw new Error(`stride: no stake-stats entry for ${statsName}`);
  const grossApr = Number(stat.currentYield);

  // Gross daily staking rewards = delegated stake * gross APR / 365.
  const dailyFees = options.createBalances();
  dailyFees.addCGToken(cg, (totalDelegations * grossApr) / 365, METRIC.STAKING_REWARDS);

  return {
    dailyFees,
    dailyRevenue: dailyFees.clone(STRIDE_FEE, METRIC.PROTOCOL_FEES),
    dailySupplySideRevenue: dailyFees.clone(1 - STRIDE_FEE, METRIC.STAKING_REWARDS),
  };
};

const methodology = {
  Fees: "Gross staking rewards earned by all native tokens delegated through Stride: the delegated balance per host zone times that chain's staking APR.",
  Revenue: "Stride keeps a 10% commission on the staking rewards.",
  SupplySideRevenue: "The remaining 90% of staking rewards accrue to stToken holders through redemption-rate appreciation.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.STAKING_REWARDS]: "Total host-chain staking rewards earned on tokens liquid staked through Stride (100% of rewards).",
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: "10% commission Stride charges on staking rewards.",
  },
  SupplySideRevenue: {
    [METRIC.STAKING_REWARDS]: "90% of staking rewards passed to stToken holders via redemption-rate appreciation.",
  },
};

const adapter: SimpleAdapter = {
  fetch,
  chains: Object.keys(config),
  methodology,
  breakdownMethodology,
  runAtCurrTime: true,
};

export default adapter;
