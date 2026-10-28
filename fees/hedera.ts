import { Dependencies, FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { queryAllium } from "../helpers/allium";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const SUPPLY_SIDE_LABEL = 'Transaction Fees To Node Operators';

const fetch = async (options: FetchOptions) => {
  const query = `
    SELECT SUM(charged_tx_fee) AS tx_fees
    FROM hedera.raw.transactions
    WHERE consensus_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
      AND consensus_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
  `;

  const res = await queryAllium(query);
  if (!res?.[0]) {
    throw new Error(`Allium returned no rows for Hedera fees on ${options.dateString}`);
  }

  const dailyFees = options.createBalances();
  // charged_tx_fee is in tinybars (1 HBAR = 1e8 tinybars)
  dailyFees.addCGToken('hedera-hashgraph', Number(res[0].tx_fees ?? 0) / 1e8, METRIC.TRANSACTION_GAS_FEES);
  const dailySupplySideRevenue = dailyFees.clone(1, SUPPLY_SIDE_LABEL);

  return { dailyFees, dailySupplySideRevenue, dailyRevenue: 0 };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.HEDERA],
  start: '2019-09-14',
  protocolType: ProtocolType.CHAIN,
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology: {
    Fees: 'Transaction fees paid by users for executing transactions on Hedera.',
    SupplySideRevenue: 'Transaction fees distributed to node operators and the staking rewards account. Hedera does not burn transaction fees.',
    Revenue: 'Hedera does not retain transaction fees as protocol revenue; fees are paid to node operators and stakers.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRANSACTION_GAS_FEES]: 'Transaction fees (charged_tx_fee) paid by users, summed from hedera.raw.transactions via Allium.',
    },
    SupplySideRevenue: {
      [SUPPLY_SIDE_LABEL]: 'Transaction fees distributed to node operators and the staking rewards account.',
    },
  },
};

export default adapter;
