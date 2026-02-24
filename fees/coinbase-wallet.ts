import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";

const chains = [
  CHAIN.ETHEREUM,
  CHAIN.BASE,
  CHAIN.OPTIMISM,
  CHAIN.POLYGON,
  CHAIN.BSC,
  CHAIN.ARBITRUM,
  CHAIN.AVAX,
];

const blacklistTokens = [
  '0x888888ae2c4a298efd66d162ffc53b3f2a869888',
  '0x618679df9efcd19694bb1daa8d00718eacfa2883',
  '0xff8bbc599ea030aa69d0298035dfe263740a95bc',
  '0xf2a92bc1cf798ff4de14502a9c6fda58865e8d5d',
  '0x7cd8c22d3f4b66230f73d7ffcb48576233c3fe33',
  '0xe552fb52a4f19e44ef5a967632dbc320b0820639',
  '0x35f3ffffcb622bc9f64fa561d74e983fd488d90c',
  '0x3fda9383a84c05ec8f7630fe10adf1fac13241cc',
  '0xb4357054c3dA8D46eD642383F03139aC7f090343',
]

function getFeeWallet(timestamp: number) {
  if (timestamp >= 1760572800) {
    return "0x5aafc1f252d544f744d17a4e734afd6efc47ede4"
  }
  else if (timestamp >= 1758067200) {
    return "0x8d413db42d6901de42b2c481cc0f6d0fd1c52828"
  }
  else {
    return "0x382fFCe2287252F930E1C8DC9328dac5BF282bA1"
  }
}

const baseAppPlatformReferrer = "0x55C88bB05602Da94fCe8FEadc1cbebF5B72c2453"

const fetch = async (options: FetchOptions) => {
  const feeWallet = getFeeWallet(options.startOfDay)
  const dailyFees = await addTokensReceived({
    options,
    target: feeWallet,
  });
  
  for (const token of blacklistTokens) {
    dailyFees.removeTokenBalance(token)
  }

  if (options.chain === CHAIN.BASE) {
    const zoraReferralFees = await addTokensReceived({
      options,
      target: baseAppPlatformReferrer
    })
    dailyFees.addBalances(zoraReferralFees)
  }
  
  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  methodology: {
    Fees: 'All fees paid by users for trading, swapping, bridging in Coinbase Wallet and referral fees from coins created in the Base App',
    Revenue: 'Fees collected by Coinbase paid by users for trading, swapping, bridging in Coinbase Wallet and referral fees from coins created in the Base App',
  },
  version: 2,
  chains,
  fetch,
};

export default adapter;
