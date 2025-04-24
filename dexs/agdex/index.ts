import { httpGet } from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const url = "https://prod.backend.agdex.io/stats/data?timestamp=";
const method = "POST";

const fetch = async (_timestamp: number, _t: any, options: FetchOptions) => {
  const date = options.startOfDay.toString();
  const res: any = await httpGet(url + date);
  const data = res.data;

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
