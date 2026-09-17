import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV3LogAdapter, UniGetRevenueRatioProps } from "../helpers/uniswap";

// Same config as fees/baseswap-v3.ts: per-pool slot0.feeProtocol (4/4 = 25% or 0/0), all of it to the treasury.
const getRevenueRatio = ({ protocolFeeRatioToken0 = 0, protocolFeeRatioToken1 = 0 }: UniGetRevenueRatioProps) => {
  const rate = (protocolFeeRatioToken0 + protocolFeeRatioToken1) / 2
  return { _revenueRatio: rate, _protocolRevenueRatio: rate }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.BASE]: {
      fetch: getUniV3LogAdapter({ factory: '0x38015d05f4fec8afe15d7cc0386a126574e8077b', userFeesRatio: 1, dynamicProtocolFees: true, getRevenueRatio }),
      start: '2023-07-28',
    },
  },
};

export default adapter;
