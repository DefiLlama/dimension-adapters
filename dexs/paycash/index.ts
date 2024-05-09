import { Chain } from "@defillama/sdk/build/general";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import customBackfill from "../../helpers/customBackfill";
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
  const totalVolume = historicalVolume
    .filter(volItem => (new Date(volItem.timestamp).getTime() / 1000) <= dayTimestamp)
    .reduce((acc, { value }) => acc + Number(value), 0)

  const dailyVolume = historicalVolume
    .find(dayItem => (new Date(dayItem.timestamp).getTime() / 1000) === dayTimestamp)?.value

  return {
    totalVolume: `${totalVolume}`,
    dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
    timestamp: dayTimestamp,
  };
};


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.EOS]: {
      fetch,
      start: 1618370204,
      customBackfill: customBackfill(CHAIN.EOS as Chain, (_chian: string) => fetch)
    },
  },
};

export default adapter;
