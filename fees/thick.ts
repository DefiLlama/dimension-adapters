import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getDexFeesExportsV3 } from "../helpers/dexVolumeLogs";

const poolFactoryAddress = '0xE6dA85feb3B4E0d6AEd95c41a125fba859bB9d24';

const methodology = {
  UserFees: "Traders using Thick Liquidiy pay a Trading fee on each swap. Includes Flash Loan Fees.",
  Fees: "Net Trading fees paid is the Sum of fees sent to LP & Protocol Fees",
  Revenue: "A variable % of the trading fee is collected as Protocol Fees.",
  ProtocolRevenue: "100% of Revenue is collected by Protocol Treasury.",
  HoldersRevenue: "100% of Revenue is used to buyback ELITE.",
  SupplySideRevenue: "The portion of trading fees paid to liquidity providers."
}

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.FANTOM]: {
      fetch: getDexFeesExportsV3({ chain: CHAIN.FANTOM, factory: poolFactoryAddress, factoryFromBlock: 70309749}),
      start: 1699300000,
      meta: { methodology: { ...methodology, } },
    },
    [CHAIN.ARBITRUM]: {
      fetch: getDexFeesExportsV3({ chain: CHAIN.ARBITRUM, factory: poolFactoryAddress, factoryFromBlock: 148243463}),
      start: 1699300000,
      meta: { methodology: { ...methodology, } },
    },
    [CHAIN.BASE]: {
      fetch: getDexFeesExportsV3({ chain: CHAIN.BASE, factory: poolFactoryAddress, factoryFromBlock: 6314325}),
      start: 1699300000,
      meta: { methodology: { ...methodology, } },
    }
  }
}

export default adapters;
