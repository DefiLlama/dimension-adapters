/*
METHODOLOGY:

Revenue is distributed as follows (Source: https://possumlabs.wtf/how-it-works):

Holders Revenue (43% of total PossumLabs share):
- Buy/Burn (50% of total): WTFO tokens are purchased and burned - PossumLabs: 50%

Protocol Revenue (57% of total):
- Development/Growth (26.5% of total)
- Marketing (26.5% of total): Platform promotion

*/

import { CHAIN } from '../../helpers/chains'
import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { httpGet } from '../../utils/fetchURL';

const fetch = async (options: FetchOptions) => {
  const FeesData = await httpGet('https://possumlabs.wtf/api/volume?dayFees=true')
  const dailyFees = FeesData.dayFees;
  const dailyProtocolRevenue = dailyFees * (0.3 / 0.7)
  const dailyHoldersRevenue = dailyFees * (0.4 / 0.7)

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue: 0,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2025-09-02',
  methodology: {
    Fees: "Trading fees paid by users on bonding curve(0.7% of volume as possumlabs share).",
    Revenue: "protocol earns 0.7% of volume as revenue",
    HoldersRevenue: "0.3% of volume is used for token buyback(0.15% of tokens are burned and 0.15% are shared with holders).",
    ProtocolRevenue: "0.2% of volume for development and 0.2% for marketing buybacks",
    SupplySideRevenue: "0.1% of volume is used for liquidity providers"
  },
};

export default adapter;