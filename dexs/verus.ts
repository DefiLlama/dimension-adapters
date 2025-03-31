import { ChainBlocks, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDay } from "../utils/date";
import { httpGet } from "../utils/fetchURL";

const methodology = {
  Fees: "A 0.025% fee is charged to users on every conversion.",
  UserFees: "Users pay 0.025% fee on every conversion.",
  ProtocolRevenue: "All fees added to reserves, block reward for miners and stakers.",
}

const fetch = async (_: number , __: ChainBlocks, ___: FetchOptions) => {
  // get current data volumes
  const timestamp = getTimestampAtStartOfDay(Math.floor(new Date().getDate() / 1000));

  const response = await httpGet('https://marketapi.verus.services/getdefichaininfo');

  let dailyVolume = 0;
  for (const result of response.data.results) {
    dailyVolume += Number(result.lp_volume);
  }

  const dailyFees = dailyVolume * 0.00025;
  const dailyRevenue = dailyFees;

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    timestamp: timestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.VERUS]: {
      fetch,
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;
