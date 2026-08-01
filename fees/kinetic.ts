import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getFees } from "../helpers/compoundV2";

const markets: Array<string> = [
  '0x8041680Fb73E1Fe5F851e76233DCDfA0f2D2D7c8',
  '0xDcce91d46Ecb209645A26B5885500127819BeAdd',
  '0x15F69897E6aEBE0463401345543C26d1Fd994abB',
]

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  
  for (const market of markets) {
    await getFees(market, options, { dailyFees, dailyRevenue })
  }
  
  const dailySupplySideRevenue = dailyFees.clone(1)
  dailySupplySideRevenue.subtract(dailyRevenue)
  
  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains:[CHAIN.FLARE],
  methodology: {
    Fees: "Total interest paid by borrowers",
    Revenue: "Protocol's share of interest treasury",
    ProtocolRevenue: "Protocol's share of interest into treasury",
    SupplySideRevenue: "Interest paid to lenders in liquidity pools"
  },
}

export default adapter;
