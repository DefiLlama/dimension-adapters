import { FetchResult } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { queryDune } from "../../helpers/dune";

const fetch = async (timestamp: number): Promise<FetchResult> => {
  const unixTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  try {
    // 3385640 old query id
    const data = await queryDune("3391484", { endTime: unixTimestamp + 86400 });
    return {
      dailyVolume:  data[0]?.volume || "0",
      timestamp: unixTimestamp,
    };
  } catch (e: any) {
    return {
      dailyVolume: "0",
      timestamp: unixTimestamp,
    };
  }
};

const adapter = {
  breakdown: {
    derivatives: {
      [CHAIN.SOLANA]: {
        fetch,
        runAtCurrTime: true,
        start: async () => 1705968000,
      },
    },
  },
};

export default adapter;
