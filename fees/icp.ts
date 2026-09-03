import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const ONE_DAY_IN_SECONDS = 60 * 60 * 24

async function fetch(options: FetchOptions) {

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

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  dailyFees.addCGToken("internet-computer", feesInIcp, 'Transaction Fees');
  dailyRevenue.addCGToken("internet-computer", feesInIcp, 'Token Burn');

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
    Revenue: "Same as fees. Consumed cycles are destroyed, and node providers are paid from newly minted ICP rather than out of fees, so no part of the fee is paid to a supply side.",
    HoldersRevenue: "Same as revenue, as burns are deflationary benefiting holders.",
  },
  breakdownMethodology: {
    Fees: {
      'Transaction Fees': "Cycles consumed on the Internet Computer network, converted to ICP equivalent using the daily average ICP/XDR conversion rate.",
    },
    Revenue: {
      'Token Burn': "Cycles consumed are destroyed, so the whole fee is burned.",
    },
  }
};

export default adapter;
