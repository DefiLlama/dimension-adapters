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
    dailyFees: result.fees,
  };
};

const methodology = {
  Fees: "All fees comes from synthetic option activation, which are about 1% of the notional value of option."
};

const adapter: SimpleAdapter = {
  deadFrom: '2025-04-22',
  methodology,
  fetch,
  chains: [CHAIN.ARBITRUM],
  start: '2024-02-05'
};

export default adapter;
