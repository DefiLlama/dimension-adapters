import { FetchResultFees, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

interface IRaw  {
  XO_RoyaltiesPaidUSD: number;
  XO_FeesPaidUSD: number;
  Day: string;
}

const fetchFees = async (timestamp: number): Promise<FetchResultFees> => {
  const startTime = 1683849600;
  const beforeTime = timestamp + 86400;
  const startTimeStr = new Date(startTime * 1000).toISOString().split("T")[0];
  const toDayTime = new Date(timestamp * 1000).toISOString().split("T")[0];
  const toDayTimeStr = new Date(beforeTime * 1000).toISOString().split("T")[0];
  const url = `https://proxy-api.xoxno.com/getMarketplaceVolume?after=${startTimeStr}&before=${toDayTimeStr}&bin=1d`;
  const response: IRaw[] = (await httpGet(url, {
    headers: {
      origin: 'https://xoxno.com',
      referer: 'https://xoxno.com/'
    }
  }));
  // const fs = require('fs');
  // fs.writeFileSync('./xoxno.json', JSON.stringify(response));
  // const response: IRaw[] = require('./xoxno.json');

  const toDayStr = toDayTime.split('-')[1] +'-'+ toDayTime.split('-')[2];
  const dayData = response.find((item) => item.Day === toDayStr);
  const dailyFees = (dayData?.XO_FeesPaidUSD || 0) + (dayData?.XO_RoyaltiesPaidUSD || 0);
  const dailyRevenue = dayData?.XO_FeesPaidUSD;
  return {
    dailyFees: `${dailyFees}`,
    dailyRevenue: `${dailyRevenue}`,
    timestamp
  }
}
const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.ELROND]: {
      fetch: fetchFees,
      start: 1683849600,
    }
  }
}
export default adapters;
