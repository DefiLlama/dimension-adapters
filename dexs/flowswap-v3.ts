import { CHAIN } from '../helpers/chains';
import { uniV3Exports } from '../helpers/uniswap';

export default uniV3Exports({
  [CHAIN.FLOW]: {
    factory: '0xca6d7Bb03334bBf135902e1d919a5feccb461632',
    userFeesRatio: 1,
    revenueRatio: 0,
    protocolRevenueRatio: 0,
    holdersRevenueRatio: 0,
  },
});
