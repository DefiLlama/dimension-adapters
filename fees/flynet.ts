import { Adapter, Dependencies, FetchOptions, ProtocolType } from "../adapters/types";
import { queryAllium } from "../helpers/allium";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const CG_TOKEN = 'F2';
const SUPPLY_SIDE_LABEL = 'Transaction Gas Fees To Sequencer';

const fetch = async (options: FetchOptions) => {
  const query = `
    SELECT SUM(gas_price * receipt_gas_used) AS tx_fees
    FROM flynet.raw.transactions
    WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
      AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
  `;

  const res = await queryAllium(query);
  if (!res?.[0]) {
    throw new Error(`Allium returned no rows for Flynet fees on ${options.dateString}`);
  }

  const dailyFees = options.createBalances();
  dailyFees.addCGToken(CG_TOKEN, Number(res[0].tx_fees ?? 0) / 1e18, METRIC.TRANSACTION_GAS_FEES);
  const dailySupplySideRevenue = dailyFees.clone(1, SUPPLY_SIDE_LABEL);

  return { dailyFees, dailySupplySideRevenue };
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.FLYNET],
  start: '2025-02-27',
  protocolType: ProtocolType.CHAIN,
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology: {
    Fees: 'Transaction fees paid by users for executing transactions on Flynet.',
    SupplySideRevenue: 'Transaction fees paid to the Flynet sequencer and validators.',
    Revenue: 'Flynet does not retain transaction fees as protocol revenue.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRANSACTION_GAS_FEES]: 'Gas fees paid by users for executing transactions on Flynet.',
    },
    SupplySideRevenue: {
      [SUPPLY_SIDE_LABEL]: 'Gas fees paid to the Flynet sequencer and validators.',
    },
  },
};

export default adapter;
