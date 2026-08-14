import { CHAIN } from "../../helpers/chains";
import { FetchResultFees, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { addTokensReceived } from "../../helpers/token";
import { METRIC } from "../../helpers/metrics";
import { httpGet } from "../../utils/fetchURL";

const API_ENDPOINT = "https://pro.edgex.exchange/api/v1/public/quote/fee";

interface IEdgeXFeeResponse {
  code: string;
  data: {
    dayTimestamp: number;
    fee: string;
    revenue: string;
  }[];
  msg: string | null;
  errorParam: string | null;
  requestTime: string;
  responseTime: string;
  traceId: string;
}

const fetch = async (options: FetchOptions): Promise<FetchResultFees> => {
  const apiUrl = `${API_ENDPOINT}?filterBeginKlineTimeInclusive=${(options.fromTimestamp - 800) * 1000}&filterEndKlineTimeExclusive=${options.toTimestamp * 1000}`;

  const { data }: IEdgeXFeeResponse = await httpGet(apiUrl)

  const startOfDayUTC = options.startOfDay * 1000;
  const dayData = data.find(item => item.dayTimestamp === startOfDayUTC);

  if (!dayData) {
    throw new Error(`No fee data found for timestamp ${options.dateString} (ms: ${startOfDayUTC}) in edgeX response`);
  }

  const fees = Number(dayData.fee);
  const revenue = Number(dayData.revenue);
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  dailyFees.addUSDValue(fees, METRIC.TRADING_FEES);
  dailyRevenue.addUSDValue(revenue, METRIC.PROTOCOL_FEES);
  dailySupplySideRevenue.addUSDValue(fees - revenue, "Referral Rewards");

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
  };
};

const fetchBB = async (options: FetchOptions) => {
  const buybacks = await addTokensReceived({
    options,
    target: '0x221e7fca09589ab2d7dc552ee72acf1a2ff10048',
    token: '0xb0076de78dc50581770bba1d211ddc0ad4f2a241',
  });
  const dailyFees = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  dailyHoldersRevenue.addBalances(buybacks, METRIC.TOKEN_BUY_BACK);

  return { dailyFees, dailyRevenue: dailyFees, dailySupplySideRevenue: dailyFees, dailyHoldersRevenue };
};

const methodology = {
  Fees: "Total trading fees paid by users on edgeX v1.",
  Revenue: "The portion of trading fees kept by the protocol.",
  SupplySideRevenue: "The portion of trading fees distributed as referral rewards.",
  HoldersRevenue: "EDGE token buybacks funded by edgeX protocol revenue.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "All trading fees paid by users on edgeX v1.",
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: "Trading fees kept by the edgeX protocol.",
  },
  SupplySideRevenue: {
    "Referral Rewards": "The portion of trading fees distributed as referral rewards.",
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: "EDGE token buybacks funded by edgeX protocol revenue.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.EDGEX]: { fetch, start: '2025-02-25'},
    [CHAIN.ETHEREUM]: { fetch: fetchBB, start: '2026-04-01'},
  },
  methodology,
  breakdownMethodology,
};

export default adapter; 
