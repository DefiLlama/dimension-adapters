import {CHAIN} from "../../helpers/chains";
import {uniV2Exports} from "../../helpers/uniswap";
import {SimpleAdapter} from "../../adapters/types";

const FACTORY_ADDRESS = '0x9E6d21E759A7A288b80eef94E4737D313D31c13f';

const methodology = {
  UserFees: "Users pays 0.3% of each swap",
  Fees: "A 0.3% trading fee is collected",
  Revenue: "A 1/6 fees goes to the protocol",
  SupplySideRevenue: "5/6 of trading fees are distributed among liquidity providers."
}

const adapters: SimpleAdapter = uniV2Exports({
  [CHAIN.BITGERT]: {
    factory: FACTORY_ADDRESS,
    fees: 0.003,
    revenueRatio: 1 / 6,
    userFeesRatio: 1
  },
  [CHAIN.CORE]: {
    factory: FACTORY_ADDRESS,
    fees: 0.003,
    revenueRatio: 1 / 6,
    userFeesRatio: 1,
  },
})

adapters.methodology = methodology;

export default adapters;
