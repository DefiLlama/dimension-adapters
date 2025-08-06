import request from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

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
    dailyFees.addUSDValue(+pool.dynamicData.fees24h);
    dailyFees.addUSDValue(+pool.dynamicData.yieldCapture24h);
    dailyVolume.addUSDValue(+pool.dynamicData.volume24h);
    dailyRevenue.addUSDValue(+(pool.dynamicData.fees24h * 0.5)); // 50% of fees go to the protocol
    dailyRevenue.addUSDValue(+(pool.dynamicData.yieldCapture24h * 0.1)); // 10% of yield capture goes to the protocol
    dailySupplySideRevenue.addUSDValue(+pool.dynamicData.yieldCapture24h * 0.9); // 90% of yield capture goes to the supply side
    dailySupplySideRevenue.addUSDValue(+pool.dynamicData.fees24h * 0.5); // 50% of fees goes to the supply side
  });
  return { dailyFees, dailyVolume, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  runAtCurrTime: true,
  chains: Object.keys(v3ChainMapping),
  methodology: {
    Fees: "Fees earned from all the trades and yield in the last 24 hours.",
    Revenue: "Revenue earned by the protocol in the last 24 hours, which is 50% of the trade fees and 10% of the yield capture.",
    ProtocolRevenue: "Revenue earned by the protocol in the last 24 hours, which is 50% of the trade fees and 10% of the yield capture.",
    SupplySideRevenue: "Revenue earned by the supply side in the last 24 hours, which is 90% of the yield capture and 50% of the fees.",
  },
};

export default adapter;
