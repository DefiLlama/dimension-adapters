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

const URL = "https://api.thegraph.com/subgraphs/name/web3dev00/optionblitz";

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

  let dailyVolume = BigInt(0);
  let totalVolume = BigInt(0);

  if (dayDataResponse) {
    dailyVolume = BigInt(dayDataResponse.volumeUsdc);
  }

  if (totalDataResponse.length > 0) {
    totalVolume = BigInt(totalDataResponse[0].totalVolumeUsdc);
  }

  balances.add(ADDRESSES.arbitrum.USDC_CIRCLE, dailyVolume.toString());
  balances1.add(ADDRESSES.arbitrum.USDC_CIRCLE, totalVolume.toString());

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
      start: 194784191,
    },
  },
};
export default adapters;
