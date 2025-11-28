// source: https://ant.fun

import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getConfig } from '../helpers/cache';
import { getSolanaReceivedDune } from '../helpers/token';

// API endpoint for dynamic fee addresses
const FEE_ADDRESSES_API = 'https://api2.ant.fun/api/v1/config/fee-addresses';

async function getFeeAddresses(): Promise<string[]> {
  const response = await getConfig('antfun-fee-wallets', FEE_ADDRESSES_API);

  const addresses = response?.data?.sol || response?.data?.addresses || response?.addresses;
  
  if (!addresses) {
    throw Error('failed to get fees wallets');
  } else {
    return addresses;
  }
}

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
  // Get fee addresses dynamically from API
  const feeAddresses = await getFeeAddresses();
  
  const dailyFees = await getSolanaReceivedDune({
    options,
    targets: feeAddresses,
    blacklist_mints: [
      'So11111111111111111111111111111111111111112',
    ],
  })

  return { dailyFees, dailyRevenue: dailyFees, }
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2025-07-01',
  isExpensiveAdapter: true,
  dependencies: [Dependencies.DUNE],
  methodology: {
    Fees: "All trading fees (SOL, USDC, USDT) paid by users while using ant.fun trading bot.",
    Revenue: "Trading fees are collected by ant.fun protocol."
  }
};

export default adapter;
