import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import type { SimpleAdapter } from "../../adapters/types";

const URL = "https://api.orderly.org/v1/public/futures_market?broker_id=desk";

interface Response {
  rows: {
    "24h_amount": number;
  }[];
}

const fetch = async (_a: any) => {
  const response = await fetchURL(URL);
  const data: Response = response.data;

  const dailyVolume = data.rows.reduce(
    (acc: number, item: any) => acc + item["24h_amount"],
    0
  );

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ARBITRUM],
  start: '2025-08-18',
  runAtCurrTime: true,
};

export default adapter;
