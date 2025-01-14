import ADDRESSES from "../../helpers/coreAssets.json";
import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, request } from "graphql-request";
import * as sdk from "@defillama/sdk";
import { get } from "http";
import { getCurrentUnixTimestamp, getTimestampAtStartOfDay } from "../../utils/date";

interface IDayDataGraph {
  id: string;
  volumeUsdc: string;
}
interface ITotalDataGraph {
  id: string;
  totalVolumeUsdc: string;
  timestamp: string;
}

const URL = sdk.graph.modifyEndpoint('5m8N5qAkDWTf2hhMFhJJJDsWWF5b9J7bzFbXwPnZHJQQ');

const fetch = async (timestamp: number): Promise<FetchResult> => {
  const dayTimestamp = getTimestampAtStartOfDay(timestamp);
  const chain = CHAIN.ARBITRUM;
  const balances = new sdk.Balances({ chain });
  const balances1 = new sdk.Balances({ chain });

  const dayDataQuery = gql`
  {
    dayData(id: ${dayTimestamp * 1000}) {
      id
      volumeUsdc
    }
  }`;

  const totalDataQuery = gql`
    {
    totalDatas {
      id
      totalVolumeUsdc
      timestamp
    }
  }`

  const dayDataResponse: IDayDataGraph = (await request(URL, dayDataQuery)).dayData;
  const totalDataResponse: ITotalDataGraph[] = (await request(URL, totalDataQuery)).totalDatas;

  let dailyVolume = Number(0);
  let totalVolume = Number(0);

  if (dayDataResponse) {
    dailyVolume = Number(dayDataResponse.volumeUsdc) / 1000;
  }

  if (totalDataResponse.length > 0) {
    totalVolume = Number(totalDataResponse[0].totalVolumeUsdc) / 1000;
  }

  balances.add(ADDRESSES.arbitrum.USDC_CIRCLE, dailyVolume);
  balances1.add(ADDRESSES.arbitrum.USDC_CIRCLE, totalVolume);

  return {
    timestamp: dayTimestamp,
    dailyNotionalVolume: 0,
    dailyPremiumVolume:  await balances.getUSDString(),
    totalNotionalVolume: 0,
    totalPremiumVolume: await balances1.getUSDString(),
  };
};

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetch as any,
    },
  },
};
export default adapters;
