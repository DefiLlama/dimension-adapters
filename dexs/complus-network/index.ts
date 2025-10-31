import { CHAIN } from "../../helpers/chains";
import { getUniV2LogAdapter } from "../../helpers/uniswap";
import { SimpleAdapter } from "../../adapters/types";

const config = {
  fees: 0.003,
  userFeesRatio: 1,
  revenueRatio: 0,
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: 'Users pay 0.3% per swap.',
    UserFees: 'Users pay 0.3% per swap.',
    Revenue: 'No revenue',
    SupplySideRevenue: 'Swap fees distributed to LPs.',
  },
  adapter: {
    [CHAIN.POLYGON]: { fetch: getUniV2LogAdapter({ factory: '0x973c934137dd687eca67bdd1c5a8b74286964ac6', ...config }) },
    // [CHAIN.HECO]: { fetch: getUniV2LogAdapter({ factory: '0xc32cccf795940ca8491cd4f31161509db28ab719', ...config }) },
    [CHAIN.BSC]: { fetch: getUniV2LogAdapter({ factory: '0xdf97982bf70be91df4acd3d511c551f06a0d19ec', ...config }) },
    [CHAIN.AVAX]: { fetch: getUniV2LogAdapter({ factory: '0x5c02e78a3969d0e64aa2cfa765acc1d671914ac0', ...config }) },
  },
}

export default adapter;
