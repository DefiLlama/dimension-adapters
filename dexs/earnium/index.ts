import { httpGet } from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const config_rule = {
  headers: {
    "user-agent": "axios/1.6.7",
  },
  withCredentials: true,
};


const fetch = async (_a:any, _b:any, options:FetchOptions) => {
  const url = "https://api.earnium.io/api/v1/tool/defillama/dimension-adapter?timestamp=" + options.startOfDay;
  const earniumData = (await httpGet(url, config_rule)).data;
  const rawFees = Number(earniumData.fees24h)
  const dailyVolume = Number(earniumData.volume24h)

  const dailyFees = options.createBalances()
  dailyFees.addUSDValue(rawFees, 'Swap Fees')

  const dailyUserFees = options.createBalances()
  dailyUserFees.addUSDValue(rawFees, 'Swap Fees')

  const dailyProtocolRevenue = options.createBalances()
  dailyProtocolRevenue.addUSDValue(rawFees * 0.01, 'Protocol Fee')

  const dailySupplySideRevenue = options.createBalances()
  dailySupplySideRevenue.addUSDValue(rawFees * 0.90, 'LP Fees')
  dailySupplySideRevenue.addUSDValue(rawFees * 0.09, 'Referrer Fees')

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "swap fees paid by users on each trade",
  UserFees: "swap fees paid by users on each trade",
  Revenue: "1% of swap fees goes to protocol",
  ProtocolRevenue: "1% of swap fees goes to protocol",
  HoldersRevenue: "No holders revenue",
  SupplySideRevenue: "99% of swap fees goes to LPs (90%) and referrers (9%)"
}

const breakdownMethodology = {
  Fees: { 'Swap Fees': 'Fees paid by traders on each swap.' },
  UserFees: { 'Swap Fees': 'Fees paid by traders on each swap.' },
  Revenue: { 'Protocol Fee': '1% of swap fees going to the protocol.' },
  ProtocolRevenue: { 'Protocol Fee': '1% of swap fees going to the protocol.' },
  SupplySideRevenue: {
    'LP Fees': '90% of swap fees distributed to liquidity providers.',
    'Referrer Fees': '9% of swap fees paid to referring addresses.',
  },
}

const adapter: SimpleAdapter = {
  fetch,
  methodology,
  breakdownMethodology,
  chains: [CHAIN.APTOS],
  start: '2025-08-10',
  deadFrom: '2026-03-06',
};

export default adapter;
