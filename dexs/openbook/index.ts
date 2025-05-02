import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import fetchURL, { httpGet } from "../../utils/fetchURL";


interface IVolume {
  notionalVolume24hour: number;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const url = `https://prod.arcana.markets/api/openbookv2/markets`;
  const historicalVolume: IVolume[] = (await httpGet(url, { headers: {
    "origin": "https://www.openbook.ag",
    "Referer": "https://www.openbook.ag",
    "user-agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36" }
  }));
  const dailyVolume = historicalVolume.reduce((a: number, b: IVolume) => a + b.notionalVolume24hour, 0);

  return {
    timestamp: dayTimestamp,
    dailyVolume: `${dailyVolume ? Number(dailyVolume) : 0}`,
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
      runAtCurrTime: true,
      start: '2022-11-17',
    },
  },
};

export default adapter;
