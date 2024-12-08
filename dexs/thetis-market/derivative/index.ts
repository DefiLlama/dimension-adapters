import BigNumber from "bignumber.js";
import { Adapter } from "../../../adapters/types";
import { CHAIN } from "../../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../../helpers/getUniSubgraphFees";
import fetchURL from "../../../utils/fetchURL";
const endpoint = "https://api.thetis.market/indexer/v1/stats/";

const fetch = async (timestamp: number) => {
  const startTime = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const endTime = startTime + 86400;

  const volumeRes = await fetchURL(
    `${endpoint}volume-daily?startTime=${startTime}&endTime=${endTime}`
  );

  if (volumeRes.length) {
    return {
      dailyVolume: new BigNumber(volumeRes[0].total).minus(new BigNumber(volumeRes[0].swap))
        .dividedBy(1e18)
        .toString(),

      timestamp: startTime,
    };
  }

  return {
    dailyVolume: 0,
    timestamp: startTime,
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.APTOS]: {
      fetch: fetch,
      start: "2024-11-26",
      meta: {
        methodology: {
          dailyVolume:
            "Volume is calculated by summing the token volume of all trades settled on the protocol that day.",
        },
      },
    },
  },
};

export default adapter;
