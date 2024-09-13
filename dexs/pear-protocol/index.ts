import { IExchangeTotalVolume } from "./../flowx-finance/index";
import { Adapter, BreakdownAdapter, FetchOptions } from "../../adapters/types";
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
  const totalVolume = res.total_volume;
  const dailyVolume = 3000000;

  return {
    totalVolume,
    dailyVolume,
    timestamp,
  };
};

const adapter: BreakdownAdapter = {
  breakdown: {
    derivatives: {
      [CHAIN.ARBITRUM]: {
        fetch: fetch,
        start: 1715199684,
      },
    },
  },
};

export default adapter;
