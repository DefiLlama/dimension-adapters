import { CHAIN } from '../../helpers/chains'
import { uniV3Exports } from '../../helpers/uniswap'

const methodology = {
  Fees: "Swap fees collected from users on each trade.",
  Revenue: "Configurable portion of the swap fees collected from users.",
  ProtocolRevenue: "When set, the protocol receives a portion of trade fees.",
};

export default {
  methodology,
  ...uniV3Exports({
    [CHAIN.VANA]: {
      factory: '0xc2a0d530e57B1275fbce908031DA636f95EA1E38',
      revenueRatio: 0.1,
      protocolRevenueRatio: 0.1,
    },
  }, { runAsV1: true }),
}