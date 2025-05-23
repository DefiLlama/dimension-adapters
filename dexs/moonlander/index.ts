import { httpGet, } from "../../utils/fetchURL";
import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const dailyEndpoint = "https://api.moonlander.trade/v1/trading-volumes/sum-by-date";

const chains: { [key: string]: string } = {
  [CHAIN.CRONOS]: "CRONOS",
  [CHAIN.CRONOS_ZKEVM]: "CRONOS_ZKEVM",
};

const getDailyUri = ({ chain, startTime, endTime, }: any) => {
  return `${dailyEndpoint}?chains=${chains[chain]}&startTime=${startTime.toISOString()}&endTime=${endTime.toISOString()}`;
};

interface APIResponse {
  vol: string;
  usdVol: string;
}

async function fetch({ startTimestamp, endTimestamp, chain }: FetchOptions) {
  const dailyData: APIResponse = await httpGet(getDailyUri({
    chain,
    startTime: new Date(startTimestamp * 1000),
    endTime: new Date(endTimestamp * 1000),
  }));

  return {
    dailyVolume: dailyData.usdVol,
  };
}

const startTimestamps: { [chain: string]: string } = {
  [CHAIN.CRONOS]: '2025-04-29',
  [CHAIN.CRONOS_ZKEVM]: '2024-12-17',
};
const adapter: any = {}

Object.keys(chains).forEach((chain) => adapter[chain] = { fetch, start: startTimestamps[chain], })

export default {
  adapter,
  version: 2,
}

