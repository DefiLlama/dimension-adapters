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
  methodology,
  fetch: fetchFeeV1(),
  adapter: {
    [CHAIN.BSC]: {
      start: maverickV1Factories[CHAIN.BSC].startTimestamp,
    },
    [CHAIN.BASE]: {
      start: maverickV1Factories[CHAIN.BASE].startTimestamp,
    },
    [CHAIN.ERA]: {
      start: maverickV1Factories[CHAIN.ERA].startTimestamp,
    },
    [CHAIN.ETHEREUM]: {
      start: maverickV1Factories[CHAIN.ETHEREUM].startTimestamp,
    },
  },
};

export default adapter;
