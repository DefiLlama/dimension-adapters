import { DISABLED_ADAPTER_KEY, FetchResultFees, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import disabledAdapter from "../../helpers/disabledAdapter";

interface IData {
  date: string;
  value: number;
}

interface IRes {
  fees: IData[];
  volumes: IData[];
}

const url = "https://api.fcon.ai/swapping/token_address/charts/?interval=90";
const fetch = async (timestamp: number): Promise<FetchResultFees & FetchResultVolume> => {
  const dateString = new Date(timestamp * 1000).toISOString().split("T")[0];
  const data: IRes = (await fetchURL(url));
  const dailyVolume = data.volumes.find((e: IData) => e.date.split('T')[0] === dateString)?.value;
  const dailyFee = data.fees.find((e: IData) => e.date.split('T')[0] === dateString)?.value;
  return {
    dailyFees: `${dailyFee}`,
    dailyVolume: `${dailyVolume}`,
    timestamp
  }
}


const adapter: SimpleAdapter = {
  adapter: {
    [DISABLED_ADAPTER_KEY]: disabledAdapter,
    [CHAIN.MANTLE]: {
      fetch: fetch,
      start: 1691280000,
    },
  },
};

export default adapter;
