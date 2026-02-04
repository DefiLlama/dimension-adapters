import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const contract = '0xe794f7eb7e644eb49056133373fb9b1ea39f22ad'
const payment_event = 'event Payment(address indexed from, uint256 value)'

const fetchFees = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const logs = await options.getLogs({
    target: contract,
    eventAbi: payment_event,
  });
  logs.map((log: any) => {
    dailyFees.addGasToken(log.value, { label: "AI agent creation and trading fees" });
    dailyRevenue.addGasToken(log.value, { label: "AI agent creation and trading fees" });
    dailyProtocolRevenue.addGasToken(log.value, { label: "AI agent creation and trading fees" });
  });

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
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
  methodology: {
    Fees: 'Fees paid by users when create and trade AI agents.',
    Revenue: 'Fees paid by users when create and trade AI agents.',
    ProtocolRevenue: 'Fees paid by users when create and trade AI agents.',
  },
  breakdownMethodology: {
    Fees: {
      "AI agent creation and trading fees": "ETH payments collected by the protocol when users create and trade AI agents",
    },
    Revenue: {
      "AI agent creation and trading fees": "ETH payments collected by the protocol when users create and trade AI agents",
    },
    ProtocolRevenue: {
      "AI agent creation and trading fees": "ETH payments collected by the protocol when users create and trade AI agents",
    },
  }
}

export default adapter;
