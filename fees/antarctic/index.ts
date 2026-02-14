import { Adapter, } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";
import { METRIC } from "../../helpers/metrics";

const feesAPI = "https://prod-openapi.antarctic.exchange/futures/common/v1/perpetual/fee"

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const url = feesAPI + "?timestamp=" + (options.startOfDay * 1000);

  const data = (await httpGet(url)) as { data: { totalFee: number } };

  const dailyFees = options.createBalances();
  dailyFees.addCGToken('usd-coin', data.data.totalFee || 0, METRIC.TRADING_FEES);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
}

const methodology = {
  Fees: "Total trading fees collected from perpetual futures trading on Antarctic Exchange",
  Revenue: "All trading fees are retained by the Antarctic Exchange protocol",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "All trading fees paid by traders when opening, closing, or modifying perpetual futures positions on Antarctic Exchange",
  },
  Revenue: {
    [METRIC.TRADING_FEES]: "All trading fees paid by traders when opening, closing, or modifying perpetual futures positions on Antarctic Exchange",
  },
}

const adapter: Adapter = {
  version: 1,
  fetch,
  start: '2025-05-10',
  chains: [CHAIN.OFF_CHAIN],
  methodology,
  breakdownMethodology,
}

export default adapter;
