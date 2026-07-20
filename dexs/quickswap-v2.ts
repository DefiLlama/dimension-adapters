import { CHAIN } from "../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { getUniV2LogAdapter } from "../helpers/uniswap";

// Governance vote executed ~9PM Nov 4, 2025; first full day under the new split is Nov 5.
const nov5th2025 = 1762300800; // Nov 5, 2025 00:00 UTC

// 0.3% swap fee: 0.25% to LPs, 0.05% is the protocol cut (revenue).
// Revenue split foundation/holders: 20/80 before the vote, 30/70 after.
const getFeeConfig = (timestamp: number) => {
  const revenueRatio = 0.05 / 0.3;
  const foundationShare = timestamp >= nov5th2025 ? 0.30 : 0.20;
  return {
    userFeesRatio: 1,
    revenueRatio,
    protocolRevenueRatio: revenueRatio * foundationShare,
    holdersRevenueRatio: revenueRatio * (1 - foundationShare),
  };
};

const mkFetch = (factory: string) => (options: FetchOptions) =>
  getUniV2LogAdapter({ factory, ...getFeeConfig(options.startOfDay) })(options);

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.POLYGON]: { fetch: mkFetch('0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32'), start: '2020-10-09' },
    [CHAIN.BASE]: { fetch: mkFetch('0xEC6540261aaaE13F236A032d454dc9287E52e56A'), start: '2025-06-04' },
    // [CHAIN.DOGECHAIN]: { fetch: mkFetch('0xC3550497E591Ac6ed7a7E03ffC711CfB7412E57F'), start: '2023-04-11' },
  },
  methodology: {
    UserFees: "User pays 0.3% fees on each swap.",
    Fees: "0.3% of each swap is collected as trading fees",
    Revenue: "Protocol takes 16.66% of collected fees (0.05% of swap volume).",
    ProtocolRevenue: "Foundation receives 30% of the protocol revenue since Nov 4, 2025 (before that 20%).",
    SupplySideRevenue: "83.33% of collected fees go to liquidity providers (0.25% of swap volume).",
    HoldersRevenue: "Community receives 70% of the protocol revenue since Nov 4, 2025 (before that 80%) for buybacks.",
  },
};

export default adapter;
