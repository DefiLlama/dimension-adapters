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
};

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

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
    dailyVolume.addUSDValue(+pool.dynamicData.volume24h);

    dailyFees.addUSDValue(+pool.dynamicData.fees24h, METRIC.SWAP_FEES);
    dailyUserFees.addUSDValue(+pool.dynamicData.fees24h, METRIC.SWAP_FEES);
    dailyRevenue.addUSDValue(+(pool.dynamicData.fees24h * 0.5), METRIC.SWAP_FEES); // 50% of fees go to the protocol
    dailySupplySideRevenue.addUSDValue(+pool.dynamicData.fees24h * 0.5, METRIC.SWAP_FEES); // 50% of fees goes to the supply side
    
    // subgraph error on hyperlqiuid yields
    if (options.chain !== CHAIN.HYPERLIQUID) {
      dailyFees.addUSDValue(+pool.dynamicData.yieldCapture24h, METRIC.ASSETS_YIELDS);
      dailyRevenue.addUSDValue(+(pool.dynamicData.yieldCapture24h * 0.1), METRIC.ASSETS_YIELDS); // 10% of yield capture goes to the protocol
      dailySupplySideRevenue.addUSDValue(+pool.dynamicData.yieldCapture24h * 0.9, METRIC.ASSETS_YIELDS); // 90% of yield capture goes to the supply side
    }
  });

  return { dailyFees, dailyUserFees, dailyVolume, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  runAtCurrTime: true,
  chains: Object.keys(v3ChainMapping),
  methodology: {
    Fees: "Fees earned from all the trades and yields.",
    UserFees: "Fees earned from all the trades.",
    Revenue: "Revenue earned by the protocol, which is 50% of the trade fees and 10% of the yield capture.",
    ProtocolRevenue: "Revenue earned by the protocol, which is 50% of the trade fees and 10% of the yield capture.",
    SupplySideRevenue: "Revenue earned by the supply side, which is 90% of the yield capture and 50% of the fees.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]: 'Swap fees paid by users from all trades.',
      [METRIC.ASSETS_YIELDS]: 'Yields captured from all assets in liquity pools.',
    },
    UserFees: {
      [METRIC.SWAP_FEES]: 'Swap fees paid by users from all trades.',
    },
    Revenue: {
      [METRIC.SWAP_FEES]: '50% of swap fees paid by users from all trades.',
      [METRIC.ASSETS_YIELDS]: '10% of yields captured from all assets in liquity pools.',
    },
    ProtocolRevenue: {
      [METRIC.SWAP_FEES]: '50% of swap fees paid by users from all trades.',
      [METRIC.ASSETS_YIELDS]: '10% of yields captured from all assets in liquity pools.',
    },
    SupplySideRevenue: {
      [METRIC.SWAP_FEES]: '50% of swap fees paid by users from all trades.',
      [METRIC.ASSETS_YIELDS]: '90% of yields captured from all assets in liquity pools.',
    },
  }
};

export default adapter;
