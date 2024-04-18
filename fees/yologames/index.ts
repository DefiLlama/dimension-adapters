import { ETHER_ADDRESS } from "@defillama/sdk/build/general";
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const nextDayTimestamp = (timestamp: number) => timestamp + 86_400_000;

const fetchDailyStats = async (
  timestampSeconds: number
): Promise<{ volumeETH: number; feesETH: number }> => {
  const timestampMs = timestampSeconds * 1000;
  const url = `https://stats.yologames.io/stats?from=${timestampMs}&to=${nextDayTimestamp(
    timestampMs
  )}`;
  return fetchURL(url)
    .then((res) => {
      return { volumeETH: Number(res.volumeETH), feesETH: Number(res.feesETH) };
    })
    .catch(() => {
      return { volumeETH: 0, feesETH: 0 };
    });
};

const fetch: any = async (timestampSeconds: number, _: any, options: FetchOptions) => {
  const statsApiResponse = await fetchDailyStats(timestampSeconds);
  return {
    timestamp: timestampSeconds,
    dailyFees: statsApiResponse.feesETH.toString(),
    dailyVolume: statsApiResponse.volumeETH.toString(),
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.BLAST]: {
      fetch,
      start: 1709251200,
      meta: {
        methodology: {
          Fees: "YOLO Games collects a 1% fee for Moon Or Doom and YOLO winnings, and a 3% fee on Poke The Bear winnings.",
          Volume:
            "YOLO Games derives volume data from the deposit transactions into all the games.",
        },
      },
    },
  },
};

export default adapter;
