import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSolanaReceived } from "../helpers/token";

const fetch: any = async (options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({
    blacklists: ['3kxSQybWEeQZsMuNWMRJH4TxrhwoDwfv41TNMLRzFP5A', 'BS3CyJ9rRC4Tp8G7f86r6hGvuu3XdrVGNVpbNM9U5WRZ'],
    blacklist_signers: ['3kxSQybWEeQZsMuNWMRJH4TxrhwoDwfv41TNMLRzFP5A', 'BS3CyJ9rRC4Tp8G7f86r6hGvuu3XdrVGNVpbNM9U5WRZ'],
    options,
    targets: [
      "3kxSQybWEeQZsMuNWMRJH4TxrhwoDwfv41TNMLRzFP5A",
      "BS3CyJ9rRC4Tp8G7f86r6hGvuu3XdrVGNVpbNM9U5WRZ",
      "4Lpvp1q69SHentfYcMBUrkgvppeEx6ovHCSYjg4UYXiq"
    ],
  });
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
      start: '2024-07-27',
    },
  },
  isExpensiveAdapter: true,
  methodology: {
    Fees: "All trading fees paid by users while using Mevx bot.",
    Revenue: "Trading fees are collected by Mevx protocol.",
    ProtocolRevenue: "Trading fees are collected by Mevx protocol.",
  }
};

export default adapter;
