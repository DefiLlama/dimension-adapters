import request from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const v3ChainMapping: any = {
  [CHAIN.ETHEREUM]: "MAINNET",
  [CHAIN.XDAI]: "GNOSIS",
  [CHAIN.ARBITRUM]: "ARBITRUM",
  [CHAIN.OPTIMISM]: "OPTIMISM",
  [CHAIN.AVAX]: "AVALANCHE",
  [CHAIN.BASE]: "BASE",
  [CHAIN.HYPERLIQUID]: "HYPEREVM",
  [CHAIN.PLASMA]: "PLASMA",
  [CHAIN.MONAD]: "MONAD",
};

const TOKENOMICS_REVAMP_DATE = "2026-04-23";

const n = (x: any) => (Number.isFinite(Number(x)) ? Number(x) : 0);

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();

  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const HOLDERS_SHARE_OF_PROTOCOL = options.dateString >= TOKENOMICS_REVAMP_DATE ? 0 : 0.825;
  const LP_SHARE_OF_SWAP_FEES = options.dateString >= TOKENOMICS_REVAMP_DATE ? 0.75 : 0.5;

  const query = `query {
  pools: poolGetPools(
    orderBy: volume24h
    orderDirection: desc
    where: { chainIn: [${v3ChainMapping[options.chain]}] protocolVersionIn: [3]}
  ) {
    address
    chain
    createTime
    decimals
    protocolVersion
    tags
    dynamicData {
      totalLiquidity
      lifetimeVolume
      lifetimeSwapFees
      volume24h
      fees24h
      yieldCapture24h
    }
  }
}`;
  const { pools } = await request("https://api-v3.balancer.fi/graphql", query);

  pools.forEach((pool: any) => {
    const fees24h = n(pool?.dynamicData?.fees24h);
    const vol24h = n(pool?.dynamicData?.volume24h);
    const yield24h = n(pool?.dynamicData?.yieldCapture24h);

    dailyVolume.addUSDValue(vol24h);

    dailyFees.addUSDValue(fees24h, METRIC.SWAP_FEES);
    dailyUserFees.addUSDValue(fees24h, METRIC.SWAP_FEES);

    dailySupplySideRevenue.addUSDValue(fees24h * LP_SHARE_OF_SWAP_FEES, METRIC.SWAP_FEES);
    dailyRevenue.addUSDValue(fees24h * (1-LP_SHARE_OF_SWAP_FEES), METRIC.SWAP_FEES);
    dailyHoldersRevenue.addUSDValue(fees24h * (1-LP_SHARE_OF_SWAP_FEES) * HOLDERS_SHARE_OF_PROTOCOL, METRIC.SWAP_FEES);
    dailyProtocolRevenue.addUSDValue(fees24h * (1-LP_SHARE_OF_SWAP_FEES) * (1-HOLDERS_SHARE_OF_PROTOCOL), METRIC.SWAP_FEES);

    // subgraph error on hyperlqiuid yields
    if (options.chain !== CHAIN.HYPERLIQUID) {
      dailyFees.addUSDValue(yield24h, METRIC.ASSETS_YIELDS);
      dailySupplySideRevenue.addUSDValue(yield24h * 0.9, METRIC.ASSETS_YIELDS); // 90% of yield capture goes to the supply side
      dailyRevenue.addUSDValue(yield24h * 0.1, METRIC.ASSETS_YIELDS);
      dailyHoldersRevenue.addUSDValue(yield24h * 0.1 * HOLDERS_SHARE_OF_PROTOCOL, METRIC.ASSETS_YIELDS);
      dailyProtocolRevenue.addUSDValue(yield24h * 0.1 * (1-HOLDERS_SHARE_OF_PROTOCOL), METRIC.ASSETS_YIELDS);
    }
  });

  return {
    dailyFees,
    dailyUserFees,
    dailyVolume,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  runAtCurrTime: true,
  chains: Object.keys(v3ChainMapping),
  methodology: {
    Fees: "Fees earned from all the trades and yields.",
    UserFees: "Fees earned from all the trades.",
    Revenue:
      "Revenue earned by the protocol and holders, which is 25% ( 50 % before 2026-04-23 ) of the trade fees and 10% of the yield capture.",
    ProtocolRevenue:
      "Revenue earned by the protocol, which is 25% ( 8.75% before 2026-04-23 ) of the trade fees and 10% of the yield capture.",
    HoldersRevenue:
      "Portion of protocol revenue distributed to token holders (e.g., veBAL/BAL) (82.5 % of revenue before 2026-04-23, 0 % of revenue after )",
    SupplySideRevenue:
      "Revenue earned by the supply side, which is 90% of the yield capture and 75% ( 50 % before 2026-04-23 ) of the fees.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]: "Swap fees paid by users from all trades.",
      [METRIC.ASSETS_YIELDS]: "Yields captured from all assets in liquidity pools.",
    },
    UserFees: {
      [METRIC.SWAP_FEES]: "Swap fees paid by users from all trades.",
    },
    Revenue: {
      [METRIC.SWAP_FEES]: "Protocol + holders share of swap fees (25%, 50% before 2026-04-23).",
      [METRIC.ASSETS_YIELDS]: "10% of yield capture taken as protocol + holders revenue.",
    },
    ProtocolRevenue: {
      [METRIC.SWAP_FEES]: "Protocol treasury share of swap fees.",
      [METRIC.ASSETS_YIELDS]: "Protocol treasury share of yield capture.",
    },
    HoldersRevenue: {
      [METRIC.SWAP_FEES]: "veBAL/BAL holders share of swap fees (0% after 2026-04-23).",
      [METRIC.ASSETS_YIELDS]: "veBAL/BAL holders share of yield capture (0% after 2026-04-23).",
    },
    SupplySideRevenue: {
      [METRIC.SWAP_FEES]: "LP share of swap fees (75%, 50% before 2026-04-23).",
      [METRIC.ASSETS_YIELDS]: "90% of yield capture distributed to LPs.",
    },
  },
};

export default adapter;
