import * as Fetch from "../../utils/fetchURL";
import * as Chains from "../../helpers/chains";
import * as Adapters from "../../adapters/types";
import * as C from "../../options/umoja/constants";

const get_data = async (timestamp: number) => {
  const url = `${C.base_endpoint}/tokens/performance/d-llama`;
  const date = new Date(timestamp * 1000).toISOString();
  const params = { date: date, range: 24 * 60 * 60, token: "*" };
  const result = await Fetch.httpGet(url, { params: params }, { withMetadata: false });

  return {
    timestamp: timestamp,
    dailyFees: result.fees,
    totalFees: result.fees_to_date,
  };
};

const adapter: Adapters.SimpleAdapter = {
  adapter: {
    [Chains.ARBITRUM]: {
      fetch: get_data,
      start: async () => new Date(C.min_start_date).getTime() / 1000,
      meta: {
        methodology: C.methodology,
        hallmarks: C.hallmarks,
      },
    },
  },
};

export default adapter;
