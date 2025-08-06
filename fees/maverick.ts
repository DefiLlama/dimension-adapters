//  Maverick v1 fee
import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchFeeV1, maverickV1Factories } from "../dexs/maverick/maverick-v1";

const methodology = {
  UserFees: "LPs collect 100% of the fee generated in a pool",
  Fees: "Fees generated on each swap at a rate set by the pool.",
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch: fetchFeeV1(),
      start: maverickV1Factories[CHAIN.BSC].startTimestamp,
      meta: { methodology },
    },
    [CHAIN.BASE]: {
      fetch: fetchFeeV1(),
      start: maverickV1Factories[CHAIN.BASE].startTimestamp,
      meta: { methodology },
    },
    [CHAIN.ERA]: {
      fetch: fetchFeeV1(),
      start: maverickV1Factories[CHAIN.ERA].startTimestamp,
      meta: { methodology },
    },
    [CHAIN.ETHEREUM]: {
      fetch: fetchFeeV1(),
      start: maverickV1Factories[CHAIN.ETHEREUM].startTimestamp,
      meta: { methodology },
    },
  },
};

export default adapter;
