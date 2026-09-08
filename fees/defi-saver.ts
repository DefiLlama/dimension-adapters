import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";

const FeeWallet = '0x6467e807db1e71b9ef04e0e3afb962e4b0900b2b';
const LABEL = 'Service Fees';

const fetch = async (options: FetchOptions) => {
  const receivedFees = await addTokensReceived({
    options,
    target: FeeWallet,
  })

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  dailyFees.addBalances(receivedFees, LABEL);
  dailyRevenue.addBalances(receivedFees, LABEL);
  dailyProtocolRevenue.addBalances(receivedFees, LABEL);
  
  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch as any,
      start: '2022-01-01',
    }
  },
  methodology: {
    Fees: 'Total fees paid by users for using DefiSaver services.',
    Revenue: 'Total fees paid are distributed to DefiSaver.',
    ProtocolRevenue: 'Total fees paid are distributed to DefiSaver.',
  },
  breakdownMethodology: {
    Fees: {
      [LABEL]: 'Fees paid by users for using Defi Saver services.',
    },
    Revenue: {
      [LABEL]: 'Fees distributed to Defi Saver.',
    },
    ProtocolRevenue: {
      [LABEL]: 'Fees distributed to Defi Saver.',
    },
  },
}
export default adapter;
