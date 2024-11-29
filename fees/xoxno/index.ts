import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

interface IRaw  {
  XO_RoyaltiesPaidUSD: number;
  XO_FeesPaidUSD: number;
  Day: string;
}

const fetchFees = async ({ fromTimestamp, toTimestamp }: FetchOptions) => {
  // const startTimeStr = new Date(fromTimestamp * 1000).toISOString().split("T")[0];
  // const toDayTimeStrNext = new Date((toTimestamp + 84000) * 1000).toISOString().split("T")[0];
  // const toDayTimeStr = new Date((toTimestamp) * 1000).toISOString().split("T")[0];
  // const url = `https://proxy-api.xoxno.com/getMarketplaceVolume?after=${startTimeStr}&before=${toDayTimeStrNext}&bin=1d`;
  // const response: IRaw[] = (await httpGet(url, {
  //   headers: {
  //     origin: 'https://xoxno.com',
  //     referer: 'https://xoxno.com/'
  //   }
  // }));

  // const toDayStr = toDayTimeStr.split('-')[1] +'-'+ toDayTimeStr.split('-')[2];
  // const dayData = response.find((item) => item.Day === toDayStr);
  // const dailyFees = (dayData?.XO_FeesPaidUSD || 0) + (dayData?.XO_RoyaltiesPaidUSD || 0);
  // const dailyRevenue = dayData?.XO_FeesPaidUSD || 0;
  return {
    dailyFees: `${0}`,
    dailyRevenue: `${0}`,
  }
}
const adapters: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ELROND]: {
      fetch: fetchFees,
      start: '2023-05-12',
    }
  }
}
export default adapters;
