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
  const dayString = new Date(timestamp * 1000).toISOString().split('T')[0]
  const historicalVolume: IVolumeall[] = (await httpPost(historicalVolumeEndpoint, requestBody))?.data.totalVolumeChart.points;
  const volumeItem = historicalVolume
    .find(dayItem => dayItem.timestamp.split('T')[0] === dayString)?.value

  let dailyVolume = Number(volumeItem)
  if (dayString === '2025-10-01') {
    // remove volume from these pools
    // https://paycashswap.com/en/pool/LQMB, https://paycashswap.com/en/pool/LQKN, https://paycashswap.com/en/pool/LQC, https://paycashswap.com/en/pool/LQKF
    dailyVolume -= (75864392 + 38941142 + 5631236 + 1355978)
  }

  return {
    dailyVolume: dailyVolume,
    timestamp: getUniqStartOfTodayTimestamp(new Date(timestamp * 1000)),
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
