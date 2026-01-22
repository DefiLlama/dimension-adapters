import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const ONE_DAY_IN_SECONDS = 60 * 60 * 24

async function fetch(_a: any, _b: any, options: FetchOptions) {

  const baseUrl = "https://ic-api.internetcomputer.org/api/v3/daily-stats?";
  const currentDay = await httpGet(`${baseUrl}start=${options.startOfDay}&end=${options.endTimestamp - 1}`);
  const previousDay = await httpGet(`${baseUrl}start=${options.startOfDay - ONE_DAY_IN_SECONDS}&end=${options.endTimestamp - ONE_DAY_IN_SECONDS - 1}`);

  const current = currentDay.daily_stats[0];
  const previous = previousDay.daily_stats[0];

  const cyclesBurned = parseFloat(current.total_cycle_burn_till_date) - parseFloat(previous.total_cycle_burn_till_date);
  const xdrBurned = cyclesBurned / 1e12;

  const rateUrl = `https://ic-api.internetcomputer.org/api/v3/avg-icp-xdr-conversion-rates?start=${options.startOfDay}&end=${options.endTimestamp - 1}&step=86400`;

  const rateResponse = await httpGet(rateUrl);

  const ratePermyriad = Number(rateResponse.avg_icp_xdr_conversion_rates[0][1]);
  const xdrPerIcp = ratePermyriad / 1e4;

  const feesInIcp = xdrBurned / xdrPerIcp;

  const revenueInIcp = (Number(current.icp_burned_total) - Number(previous.icp_burned_total)) / 1e8;

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  dailyFees.addCGToken("internet-computer", feesInIcp);
  dailyRevenue.addCGToken("internet-computer", Number(revenueInIcp));

  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue: dailyRevenue,
  };
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ICP],
  start: '2021-05-10',
  protocolType: ProtocolType.CHAIN,
  methodology: {
    Fees: "Cycles consumed on the network converted to ICP equivalent using the daily average ICP/XDR conversion rate.",
    Revenue: "ICP tokens burned to mint cycles and for transaction fees.",
    HoldersRevenue: "Same as revenue, as burns are deflationary benefiting holders.",
  }
};

export default adapter;
