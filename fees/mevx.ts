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
      "BS3CyJ9rRC4Tp8G7f86r6hGvuu3XdrVGNVpbNM9U5WRZ"
    ],
  });
  return { dailyFees, dailyRevenue: dailyFees };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
          },
  },
  isExpensiveAdapter: true,
};

export default adapter;
