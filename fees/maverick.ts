//  Maverick v1 fee
import { BreakdownAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchFeeV1, maverickV1Factories } from "../dexs/maverick/maverick-v1";
import { fetchFeeV2, maverickV2Factories } from "../dexs/maverick/maverick-v2";

const methodology = {
  UserFees: "LPs collect 100% of the fee generated in a pool",
  Fees: "Fees generated on each swap at a rate set by the pool.",
  TotalUserFees: "Cumulative all-time Fees",
  TotalFees: "Cumulative all-time Fees",
};

const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    v1: {
      [CHAIN.BSC]: {
        fetch: fetchFeeV1(),
        start: maverickV1Factories[CHAIN.BSC].startTimestamp,
      },
      [CHAIN.BASE]: {
        fetch: fetchFeeV1(),
        start: maverickV1Factories[CHAIN.BASE].startTimestamp,
      },
      [CHAIN.ERA]: {
        fetch: fetchFeeV1(),
        start: maverickV1Factories[CHAIN.ERA].startTimestamp,
      },
      [CHAIN.ETHEREUM]: {
        fetch: fetchFeeV1(),
        start: maverickV1Factories[CHAIN.ETHEREUM].startTimestamp,
      },
    },
    v2: {
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
  },
};

export default adapter;
