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

  const dailyProtocolRevenueGross = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const dailyHoldersRevenue = options.createBalances();
  const dailyProtocolRevenueNet = options.createBalances();
  const dailyRevenue = options.createBalances();

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

  let protocolGrossSum = 0;
  let supplySideSum = 0;
  pools.forEach((pool: any) => {
    const fees24h = n(pool?.dynamicData?.fees24h);
    const vol24h = n(pool?.dynamicData?.volume24h);
    const yield24h = n(pool?.dynamicData?.yieldCapture24h);

    dailyVolume.addUSDValue(vol24h);

    dailyFees.addUSDValue(fees24h, METRIC.SWAP_FEES);
    dailyUserFees.addUSDValue(fees24h, METRIC.SWAP_FEES);

    dailyProtocolRevenueGross.addUSDValue(fees24h * (1 - LP_SHARE_OF_SWAP_FEES), METRIC.SWAP_FEES);
    dailySupplySideRevenue.addUSDValue(fees24h * LP_SHARE_OF_SWAP_FEES, METRIC.SWAP_FEES);

    protocolGrossSum += fees24h * (1-LP_SHARE_OF_SWAP_FEES);
    supplySideSum += fees24h * LP_SHARE_OF_SWAP_FEES;

    // subgraph error on hyperlqiuid yields
    if (options.chain !== CHAIN.HYPERLIQUID) {
      dailyFees.addUSDValue(yield24h, METRIC.ASSETS_YIELDS);
      dailyProtocolRevenueGross.addUSDValue(
        +(yield24h * 0.1),
        METRIC.ASSETS_YIELDS
      ); // 10% of yield capture goes to the protocol
      dailySupplySideRevenue.addUSDValue(yield24h * 0.9, METRIC.ASSETS_YIELDS); // 90% of yield capture goes to the supply side

      protocolGrossSum += yield24h * 0.1;
      supplySideSum += yield24h * 0.9;
    }
  });

  const holdersUSD = protocolGrossSum * HOLDERS_SHARE_OF_PROTOCOL;
  const protocolNetUSD = protocolGrossSum - holdersUSD;

  if (holdersUSD > 0) dailyHoldersRevenue.addUSDValue(holdersUSD);
  if (protocolNetUSD > 0) dailyProtocolRevenueNet.addUSDValue(protocolNetUSD);

  dailyRevenue.addBalances(dailyHoldersRevenue);
  dailyRevenue.addBalances(dailyProtocolRevenueNet);

  return {
    dailyFees,
    dailyUserFees,
    dailyVolume,
    dailyRevenue,
    dailyProtocolRevenue: dailyProtocolRevenueNet,
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
      [METRIC.ASSETS_YIELDS]:
        "Yields captured from all assets in liquity pools.",
    },
    UserFees: {
      [METRIC.SWAP_FEES]: "Swap fees paid by users from all trades.",
    },
    Revenue: {
      [METRIC.SWAP_FEES]: "50% of swap fees paid by users from all trades.",
      [METRIC.ASSETS_YIELDS]:
        "10% of yields captured from all assets in liquity pools.",
    },
    ProtocolRevenue: {
      [METRIC.SWAP_FEES]: "50% of swap fees paid by users from all trades.",
      [METRIC.ASSETS_YIELDS]:
        "10% of yields captured from all assets in liquity pools.",
    },
    HoldersRevenue: {
      [METRIC.SWAP_FEES]: "Share of protocol revenue sent to token holders.",
      [METRIC.ASSETS_YIELDS]:
        "Share of protocol revenue from yield capture sent to token holders.",
    },
    SupplySideRevenue: {
      [METRIC.SWAP_FEES]: "50% of swap fees paid by users from all trades.",
      [METRIC.ASSETS_YIELDS]:
        "90% of yields captured from all assets in liquity pools.",
    },
  },
};

export default adapter;
