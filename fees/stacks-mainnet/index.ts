import { Adapter, FetchOptions, ProtocolType } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  
  // Note: The Stacks blockchain fee data is currently unavailable due to API limitations.
  // Flipside Crypto API is not accessible, and the Hiro API returns 400 errors.
  // This adapter returns 0 fees until a working data source is identified.
  
  dailyFees.addGasToken(0);
  
  return {
    timestamp: options.startOfDay,
    dailyFees,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.STACKS]: {
      fetch,
      start: '2025-01-01',
    },
  },
  protocolType: ProtocolType.CHAIN,
  methodology: {
    Fees: 'Total fees paid by users on Stacks blockchain',
    Revenue: 'Fees collected by the Stacks network',
  },
};

export default adapter;