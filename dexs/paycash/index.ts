import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { httpPost } from "../../utils/fetchURL";

const historicalVolumeEndpoint = "https://api.paycashswap.com/"
const requestBody = {
  operationName: "TotalVolume",
  query: "query TotalVolume {\n  totalVolumeChart {\n    value24h\n    lastWeekValue\n    percentageChange24h\n    points {\n      timestamp\n      value\n      __typename\n    }\n    __typename\n  }\n}\n",
  variables: {}
}

interface IVolumeall {
  value: string;
  timestamp: string;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const historicalVolume: IVolumeall[] = (await httpPost(historicalVolumeEndpoint, requestBody))?.data.totalVolumeChart.points;
  const dailyVolume = historicalVolume
    .find(dayItem => (new Date(dayItem.timestamp).getTime() / 1000) === dayTimestamp)?.value

  return {
    dailyVolume: dailyVolume,
    timestamp: dayTimestamp,
  };
};


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.EOS]: {
      fetch,
      start: '2021-04-14',
    },
  },
};

export default adapter;
