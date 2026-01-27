import { Adapter, FetchOptions, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const API_URL = "https://sns-api.bonfida.com/v2/defilama/fees-adapter";

interface IData {
  daily_fees: number;
  total_fees: number;
}

const fetch = async (_: number, _1: any, {fromTimestamp, toTimestamp}: FetchOptions): Promise<FetchResultFees> => {
  const url = `${API_URL}?from=${fromTimestamp}&to=${toTimestamp}`;
  const data: IData = await httpGet(url);
  return {
    dailyFees: data.daily_fees,
    dailyRevenue: data.daily_fees,
  };
};

const methodology = {
  Fees: "registration cost and fees on secondary sales",
  Revenue: "registration revenue and revenue from secondary sales",
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: '2021-06-29',
    },
  },
  methodology,
};

export default adapter;
