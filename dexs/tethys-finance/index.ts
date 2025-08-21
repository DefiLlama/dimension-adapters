import { CHAIN } from "../../helpers/chains";
import { getUniV2LogAdapter } from "../../helpers/uniswap";
import { SimpleAdapter } from "../../adapters/types";

const config = {
  fees: 0.002,
  userFeesRatio: 1,
  revenueRatio: 0.3, // 30% of fees generated from swaps are converted to METIS and distributed to staked TETHYS tokens
  protocolRevenueRatio: 0,
  holdersRevenueRatio: 0.3,
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: 'Users pay 0.2% per swap',
    UserFees: 'Users pay 0.2% per swap',
    SupplySideRevenue: '70% swap fees distributed to LPs.',
    Revenue: '30% of fees generated from swaps are converted to METIS and distributed to staked TETHYS tokens',
    ProtocolRevenue: 'Protocol collects no revenue',
    HoldersRevenue: '30% of fees generated from swaps are converted to METIS and distributed to staked TETHYS tokens',
  },
  adapter: {
    [CHAIN.METIS]: { fetch: getUniV2LogAdapter({ factory: '0x2CdFB20205701FF01689461610C9F321D1d00F80', ...config }), start: '2021-12-18' },
  },
}

export default adapter;
