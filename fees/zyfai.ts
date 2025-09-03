import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryIndexer, toByteaArray } from "../helpers/indexer";
import { addTokensReceived } from "../helpers/token";

const REVENUE_RECEIVER_WALLETS = [
  '0x62BE78705295cA9FfdAc410B4a9B6101983a7c3B',
];

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  
  await addTokensReceived({
    balances: dailyFees,
    options,
    targets: REVENUE_RECEIVER_WALLETS,
  })

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.BASE, CHAIN.SONIC],
  methodology: {
    Fees: 'All fees from users by using AI agent services',
    UserFees: 'User pay fees to using AI agent services',
    Revenue: 'All fees are revenue for ZyFAI protocol',
    ProtocolRevenue: 'All fees are revenue for ZyFAI protocol',
  },
};

export default adapter;
