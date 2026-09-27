import { Adapter, Dependencies, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchTransactionFees } from "../helpers/getChainFees";
import { METRIC } from "../helpers/metrics";

const SUPPLY_SIDE_LABEL = 'Transaction Gas Fees To Validators';

const fetch = async (options: FetchOptions) => {
  const dailyFees = await fetchTransactionFees(options);
  const dailySupplySideRevenue = dailyFees.clone(1, SUPPLY_SIDE_LABEL);

  return { dailyFees, dailySupplySideRevenue };
};

const adapter: Adapter = {
  version: 2,
  fetch,
  pullHourly: true,
  chains: [CHAIN.FANTOM],
  start: '2020-09-02',
  protocolType: ProtocolType.CHAIN,
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology: {
    Fees: 'Transaction fees paid by users for executing transactions on Fantom Opera.',
    SupplySideRevenue: 'Transaction fees distributed to validators. Fantom does not burn gas fees.',
    Revenue: 'Fantom does not retain transaction fees; all gas fees are paid to validators.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRANSACTION_GAS_FEES]: 'Gas fees paid by users for executing transactions on Fantom Opera.',
    },
    SupplySideRevenue: {
      [SUPPLY_SIDE_LABEL]: 'Gas fees distributed to validators for securing the network.',
    },
  },
};

export default adapter;
