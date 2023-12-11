import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import fetchURL from "../../utils/fetchURL";
import { getPrices } from "../../utils/prices";

const API_KEYS = process.env.DUNE_API_KEYS?.split(",") ?? [
  "L0URsn5vwgyrWbBpQo9yS1E3C1DBJpZh",
];

interface IData {
  dt: string;
  sol_dispensed: number;
}

const fetch = async (timestamp: number): Promise<FetchResultVolume> => {
  try {
    const dayTimestamp = getUniqStartOfTodayTimestamp(
      new Date(timestamp * 1000),
    );
    const dateString = new Date(dayTimestamp * 1000)
      .toISOString()
      .split("T")[0];

    const data = (
      await fetchURL(
        `https://api.dune.com/api/v1/query/2965239/results?api_key=${API_KEYS[0]}`,
      )
    ).data;

    const solDispensed =
      data?.result?.rows?.find((e: IData) => e.dt.split(" ")[0] === dateString)
        ?.sol_dispensed ?? 0;
    const dailyVolume =
      solDispensed *
      (await getPrices(["coingecko:solana"], timestamp))["coingecko:solana"]
        .price;

    return {
      dailyVolume: `${dailyVolume}`,
      timestamp,
    };
  } catch (error) {
    console.error(error);
    throw error;
  }
};

const adapter: SimpleAdapter = {
  adapter: {
    solana: {
      fetch,
      start: async () => 1657756800,
    },
  },
};

export default adapter;
