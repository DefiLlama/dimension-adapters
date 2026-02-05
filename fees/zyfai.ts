import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
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

    // ignore buy back from revenue wallet
    logFilter: (log: any) => {
      return log.from_address !== '0xef32a6e5b1d363ded63e35af03fc53a637926de0';
    }
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
