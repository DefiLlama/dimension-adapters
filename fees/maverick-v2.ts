//  Maverick v2 fee
import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import {
  fetchFeeV2,
  maverickV2Factories,
} from "../dexs/maverick-v2/maverick-v2";

const methodology = {
  UserFees: "LPs collect 100% of the fee generated in a pool",
  Fees: "Fees generated on each swap at a rate set by the pool.",
  TotalUserFees: "Cumulative all-time Fees",
  TotalFees: "Cumulative all-time Fees",
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch: fetchFeeV2(),
      start: maverickV2Factories[CHAIN.BSC].startTimestamp,
    },
    [CHAIN.BASE]: {
      fetch: fetchFeeV2(),
      start: maverickV2Factories[CHAIN.BASE].startTimestamp,
    },
    [CHAIN.ERA]: {
      fetch: fetchFeeV2(),
      start: maverickV2Factories[CHAIN.ERA].startTimestamp,
    },
    [CHAIN.ETHEREUM]: {
      fetch: fetchFeeV2(),
      start: maverickV2Factories[CHAIN.ETHEREUM].startTimestamp,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetchFeeV2(),
      start: maverickV2Factories[CHAIN.ARBITRUM].startTimestamp,
    },
  },
};

export default adapter;
