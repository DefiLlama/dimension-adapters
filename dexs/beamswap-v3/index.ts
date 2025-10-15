

import { CHAIN } from '../../helpers/chains'
import { uniV3Exports } from '../../helpers/uniswap'

const methodologyv3 = {
  UserFees: "User pays 0.01%, 0.05%, 0.3%, or 1% on each swap.",
  ProtocolRevenue: "Protocol receives 16% of fees.",
  SupplySideRevenue: "84% of user fees are distributed among LPs.",
  HoldersRevenue: "Holders have no revenue.",
};

const adapter = uniV3Exports({
  [CHAIN.MOONBEAM]: { factory: '0xd118fa707147c54387b738f54838ea5dd4196e71', start: '2023-05-18', revenueRatio: 0.16, holdersRevenueRatio: 0, protocolRevenueRatio: 0.16, },
})

adapter.methodology = methodologyv3

export default adapter;