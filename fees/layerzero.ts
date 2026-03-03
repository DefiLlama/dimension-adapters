import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { addTokensReceived } from "../helpers/token";
import { METRIC } from "../helpers/metrics";
import { CHAIN } from "../helpers/chains";

const fetch = async (options: FetchOptions) => {
  const fees = await addTokensReceived({options, 
    target: '0x6ac55e733dff03a54251670df0667774e8f7d28f',
    tokens: ['0x6985884c4392d348587b19cb9eaaf157f13271cd']
  })
  const dailyFees = fees.clone(1, METRIC.TOKEN_BUY_BACK)

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue: dailyFees,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2025-11-03',
  methodology: {
    Fees: 'Fees paid by users to LayerZero-based applications (e.g., Stargate bridge fees).',
    Revenue: 'Revenue allocated to the LayerZero Foundation from LayerZero ecosystem applications.',
    ProtocolRevenue: 'All Revenue goes to buybacks.',
    HoldersRevenue: 'Buybacks funded by ecosystem application revenue (currently Stargate).',
  },  
  breakdownMethodology: {
    Fees: {
      [METRIC.TOKEN_BUY_BACK]: 'Fees paid by users for LayerZero transactions',
    },
  }
}

export default adapter;
