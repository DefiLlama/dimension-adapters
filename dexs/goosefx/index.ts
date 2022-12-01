

import fetchURL, { postURL } from "../../utils/fetchURL"
import { Chain } from "@defillama/sdk/build/general";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import customBackfill from "../../helpers/customBackfill";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const dailyVolumeEndpoint = "https://nft-launchpad.goosefx.io/getTotalVolumeTrade";
const historicalVolumeEndpoint = "https://nft-launchpad.goosefx.io/getDailyVolumeTrade"

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const currentDayTimestamp = getUniqStartOfTodayTimestamp(new Date());
  if (dayTimestamp === currentDayTimestamp) {
    let res = await fetchURL(dailyVolumeEndpoint);
    return {
        dailyVolume: res?.data?.data?.totalVolumeTradeDay,
        totalVolume: res?.data?.data?.totalVolumeTrade,
        timestamp: dayTimestamp
    };
  } else {
    const formattedDate = new Date(dayTimestamp * 1000).toISOString().substring(0, 10);
    const dayVolume = await postURL(historicalVolumeEndpoint, {
        "date": formattedDate
    });
    return {
        totalVolume: dayVolume?.data?.data[0]?.totalVolumeTradeDay,
        dailyVolume: dayVolume?.data?.data[0]?.totalVolumeTrade,
        timestamp: dayTimestamp,
    };
  }
};

const adapter: SimpleAdapter = {
    adapter: {
      [CHAIN.SOLANA]: {
        fetch: fetch,
        start: async () => 1664360407,
        customBackfill: customBackfill(CHAIN.SOLANA as Chain, () => fetch)
      },
    },
  };
  
  export default adapter;
