import { FetchResult } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { queryDune } from "../../helpers/dune";

const fetch = async (timestamp: number): Promise<FetchResult> => {
  const unixTimestamp = getUniqStartOfTodayTimestamp(
    new Date(timestamp * 1000)
  );

  try {
    const data = await queryDune("3385640");
    const chainData = data.find(
      ({ day }: { day: string }) =>
        getUniqStartOfTodayTimestamp(new Date(day)) === unixTimestamp
    );

    return {
      dailyVolume: chainData?.volume ?? "0",
      timestamp: unixTimestamp,
    };
  } catch (e) {
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
