import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const base_endpoint = "https://api.protocol.umoja.xyz";

const fetch = async (timestamp: number, _b:any, _c:FetchOptions) => {
  const url = `${base_endpoint}/tokens/performance/d-llama`;
  const date = new Date(timestamp * 1000).toISOString();
  const params = { date: date, range: 24 * 60 * 60, token: "*" };
  const result = await httpGet(url, { params: params }, { withMetadata: false });

  return {
    dailyPremiumVolume: result.fees,
    dailyNotionalVolume: result.notional,
  };
};

const adapter: SimpleAdapter = {
  deadFrom: '2025-04-22',
  fetch,
  chains: [CHAIN.ARBITRUM],
  start: '2024-02-05'
};

export default adapter;
