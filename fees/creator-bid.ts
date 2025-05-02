import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const contract = '0xe794f7eb7e644eb49056133373fb9b1ea39f22ad'
const payment_event = 'event Payment(address indexed from, uint256 value)'

const fetchFees = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const logs = await options.getLogs({
    target: contract,
    eventAbi: payment_event,
  });
  logs.map((log: any) => {
    dailyFees.addGasToken(log.value);
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
}


const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetchFees,
      start: '2024-09-09',
    },
  },
}

export default adapter;
