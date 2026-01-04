import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const fetch = async (options: FetchOptions) => {
  const openInterestAtEnd = options.createBalances();
  
  // USDT token on BSC
  const token = '0x55d398326f99059fF775485246999027B3197955';
  
  // Opinion contract wallet
  const wallet = '0xad1a38cec043e70e83a3ec30443db285ed10d774';
  
  // Get current USDT balance of the Opinion contract
  const balance = await options.api.call({
    abi: 'function balanceOf(address) view returns (uint256)',
    target: token,
    params: [wallet]
  });
  
  openInterestAtEnd.add(token, balance);
  
  return {
    openInterestAtEnd,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch: fetch,
      start: '2025-10-16',
    },
  },
};

export default adapter;