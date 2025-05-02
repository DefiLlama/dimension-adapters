import { ETHER_ADDRESS } from "@defillama/sdk/build/general";
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const fetchDailyStats = async (
  from: number, to: number
): Promise<{ feesETH: number }> => {
  const url = `https://stats.yologames.io/stats?from=${from * 1000}&to=${to * 1000}`;
  const response = await fetchURL(url);
  return { feesETH: response.feesETH };
};

const fetch: any = async ({ createBalances, fromTimestamp, toTimestamp }: FetchOptions) => {
  const dailyFees = createBalances();
  const statsApiResponse = await fetchDailyStats(fromTimestamp, toTimestamp);
  dailyFees.add(ETHER_ADDRESS, statsApiResponse.feesETH * 1e18);
  return { dailyFees };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.BLAST]: {
      fetch,
      start: '2024-03-01',
      meta: {
        methodology: {
          Fees: "YOLO Games collects a 1% fee for Moon Or Doom and YOLO winnings, and a 3% fee on Poke The Bear winnings.",
        },
      },
    },
  },
};

export default adapter;
