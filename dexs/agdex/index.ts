import { httpPost } from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const url = "https://endpoint.sentio.xyz/solution3_sentio/agdex/defillama";
const method = "POST";

const fetch = async (_timestamp: number, _t: any, options: FetchOptions) => {
  const date = new Date(options.startOfDay * 1000);
  const payload = {
    date: date.toISOString(),
  };

  const data: any = await httpPost(url, JSON.stringify(payload), {
    method,
    headers: {
      "Content-Type": "application/json",
      "api-key": "B3bAPWbN2hEslb62aYkOlSXWzb9mYvnV9",
    },
  });

  return {
    totalVolume: `${
      data.syncSqlResponse.result.rows[0].totalVolume / Math.pow(10, 18)
    }`,
    dailyVolume: `${
      data.syncSqlResponse.result.rows[0].dailyVolume / Math.pow(10, 18)
    }`,
    totalFees: `${data.syncSqlResponse.result.rows[0].totalFee}`,
    dailyFees: `${data.syncSqlResponse.result.rows[0].dailyFee}`,
    timestamp: options.startOfDay,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.APTOS]: {
      fetch,
      start: "2024-11-26",
    },
  },
};

export default adapter;
