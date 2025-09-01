import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

const methodology = {
  UserFees: "Users pays 0.2% of each swap",
  Fees: "A 0.2% trading fee is collected",
  Revenue: "A 0.05% (bsc and ethereum) or 0.15% (polygon and telos) of the fees goes to treasury, 50% of that fee is used to buyback and burn BANANA, on Telos 25% of the collected fees goes to Telos",
  ProtocolRevenue: "A 0.05% (bsc and ethereum) or 0.15% (polygon) or 0.0375% (telos) of the fees goes to treasury",
  HoldersRevenue: "Of all DEX trading fees earned by ApeSwap, 50% are used to buy back and burn BANANA on a quarterly basis",
  SupplySideRevenue: "A 0.15% (bsc and ethereum) or 0.05% (polygon and telos) is distributed proportionally to all APE-LP token holders",
}

const getUniV2LogAdapterConfig = {
  fees: 0.002, // 0.2%
  userFeesRatio: 1,
  revenueRatio: 0.15, // 15% of swap fees, 0.03% from 0.2% swap fees
  protocolRevenueRatio: 0, // no protocol fees
  holdersRevenueRatio: 0.15, // revenue to xBOO -> holders revenue
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  adapter: {
    [CHAIN.BSC]: { fetch: getUniV2LogAdapter({ factory: '0x0841BD0B734E4F5853f0dD8d7Ea041c241fb0Da6', getUniV2LogAdapterConfig }), start: 1613273226 },
    [CHAIN.POLYGON]: { fetch: getUniV2LogAdapter({ factory: '0xcf083be4164828f00cae704ec15a36d711491284', getUniV2LogAdapterConfig }), start: 1623814026 },
    [CHAIN.ETHEREUM]: { fetch: getUniV2LogAdapter({ factory: '0xBAe5dc9B19004883d0377419FeF3c2C8832d7d7B', getUniV2LogAdapterConfig }), start: 1652239626 },
    [CHAIN.ARBITRUM]: { fetch: getUniV2LogAdapter({ factory: '0xCf083Be4164828f00cAE704EC15a36D711491284', getUniV2LogAdapterConfig }), start: 1678406400 },
    // [CHAIN.TELOS]: { fetch: getUniV2LogAdapter({ factory: '0x411172Dfcd5f68307656A1ff35520841C2F7fAec', getUniV2LogAdapterConfig }), start: 1665880589 },
  }
}

export default adapter;
