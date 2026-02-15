import { httpGet } from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const url = "https://prod.backend.agdex.io/stats/data?timestamp=";

const fetch = async (_timestamp: number, _t: any, options: FetchOptions) => {
  const date = options.startOfDay.toString();
  const res: any = await httpGet(url + date);
  const data = res.data;
  const dailyFees = options.createBalances();

  dailyFees.addGasToken(data.syncSqlResponse.result.rows[0].dailyFee, METRIC.SWAP_FEES);

  return {
    dailyVolume: `${
      data.syncSqlResponse.result.rows[0].dailyVolume / Math.pow(10, 18)
    }`,
    dailyFees,
  };
};

const methodology = "Agdex is a DEX on Aptos. Fees are collected from token swaps.";

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: 'Trading fees collected from token swaps on the Aptos DEX',
  }
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.APTOS]: {
      fetch,
      start: "2024-11-26",
    },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
