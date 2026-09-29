import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV2LogAdapter } from "../helpers/uniswap";

// PancakeSwap V2 fork: 0xFDa6...a8BB is a verified PancakeFactory.
// Swap fee is 0.25%, with 32% of fees minted to feeTo(), matching fees/baseswap-v2.ts.
const SWAP_FEE = 0.0025;
const PROTOCOL_SHARE = 0.32; // 8/25 from _mintFee

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.BASE]: {
      fetch: getUniV2LogAdapter({
        factory: '0xFDa619b6d20975be80A10332cD39b9a4b0FAa8BB',
        fees: SWAP_FEE,
        userFeesRatio: 1,
        revenueRatio: PROTOCOL_SHARE,
        protocolRevenueRatio: PROTOCOL_SHARE,
        holdersRevenueRatio: 0,
      }),
      start: '2023-07-28',
    },
  },
};

export default adapter;
