import { Adapter, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const fetch = async (
  timestamp: number,
  chainBlocks: any,
  options: FetchOptions
) => {
  const queryParams = new URLSearchParams({ limit: "1", offset: "0" }); // Define limit and offset parameters
  const url = `https://api.dune.com/api/v1/query/3779651/results?${queryParams}`;

  const opts = {
    method: "GET",
    headers: {
      "X-DUNE-API-KEY": "aBGbHEVNlpqDCkh02NAfUXucBA7e8ROZ",
    },
  };

  const response = await httpGet(url, opts);

  const res = response.result.rows[0];
  const totalfees = res.total_fees;
  const dailyfees = res.daily_fees;

  return {
    dailyFees,
    totalFees,
    timestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetch,
      start: 1718841600,
    },
  },
};

export default adapter;
