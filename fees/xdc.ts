import { Adapter, Dependencies, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchTransactionFees } from "../helpers/getChainFees";
import { METRIC } from "../helpers/metrics";

const SUPPLY_SIDE_LABEL = 'Transaction Gas Fees To Masternode Operators';

const fetch = async (options: FetchOptions) => {
  const dailyFees = await fetchTransactionFees(options);
  const dailySupplySideRevenue = dailyFees.clone(1, SUPPLY_SIDE_LABEL);

  return { dailyFees, dailySupplySideRevenue };
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.XDC],
  start: '2019-06-01',
  protocolType: ProtocolType.CHAIN,
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology: {
    Fees: 'Transaction fees paid by users for executing transactions on the XDC Network.',
    SupplySideRevenue: 'Transaction fees distributed to masternode operators. XDC does not burn gas fees.',
    Revenue: 'XDC does not retain transaction fees; all gas fees are paid to masternode operators.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRANSACTION_GAS_FEES]: 'Gas fees paid by users for executing transactions on the XDC Network.',
    },
    SupplySideRevenue: {
      [SUPPLY_SIDE_LABEL]: 'Gas fees distributed to masternode operators for validating transactions.',
    },
  },
};

export default adapter;
