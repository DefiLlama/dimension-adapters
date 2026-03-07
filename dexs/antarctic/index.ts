import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import { FetchOptions } from "../../adapters/types";
import { METRIC } from "../../helpers/metrics";

type V1TickerItem = {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  open: number;
  close: number;
  low: number;
  high: number;
  amount: number;
  volume: number;
};

const volumeAPI = "https://prod-openapi.antarctic.exchange/futures/common/v1/perpetual/contracts";
const feesAPI = "https://prod-openapi.antarctic.exchange/futures/common/v1/perpetual/fee"

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const volumeURL = volumeAPI + "?timestamp=" + (options.startOfDay * 1000);
  const feesURL = feesAPI + "?timestamp=" + (options.startOfDay * 1000);
  const volumeData = (await httpGet(volumeURL)) as { data: V1TickerItem[] };
  const dailyVolume = volumeData.data.reduce((p, c) => p + +c.volume, 0);
  const feesData = (await httpGet(feesURL)) as { data: any };
  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(feesData.data.totalFee || 0, METRIC.TRADING_FEES);
  const dailyRevenue = dailyFees.clone(0.4, METRIC.TRADING_FEES);
  const dailySupplySideRevenue = dailyFees.clone(0.6, METRIC.TRADING_FEES);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

export default {
  fetch,
  start: "2025-05-10",
  chains: [CHAIN.OFF_CHAIN],
  methodology: {
    Fees: "Total trading fees collected from perpetual futures trading on Antarctic Exchange",
    Revenue: "Share of 40% total trading fees",
    ProtocolRevenue: "Share of 40% total trading fees",
    SupplySideRevenue: "LPs get 60% trading fees",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRADING_FEES]: "All trading fees paid by traders when opening, closing, or modifying perpetual futures positions on Antarctic Exchange",
    },
    Revenue: {
      [METRIC.TRADING_FEES]: "Share of 40% total trading fees",
    },
    ProtocolRevenue: {
      [METRIC.TRADING_FEES]: "Share of 40% total trading fees",
    },
    SupplySideRevenue: {
      [METRIC.TRADING_FEES]: "LPs get 60% trading fees",
    },
  },
};
