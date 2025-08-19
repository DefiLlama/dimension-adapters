import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import type { SimpleAdapter } from "../../adapters/types";

const URL = "https://api.orderly.org/v1/public/futures_market";

interface Response {
  rows: {
    "24h_amount": number;
  }[];
}

const fetch = async (timestamp: number) => {
  const response = await httpGet(`${URL}?broker_id=desk`);
  const data: Response = response.data;

  const dailyVolume = data.rows.reduce(
    (acc: number, item: any) => acc + item["24h_amount"],
    0
  );

  return {
    dailyVolume: dailyVolume.toString(),
    timestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: "2025-08-18",
    },
  },
};

export default adapter;
