import { Dependencies, FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { queryAllium } from "../helpers/allium";
import { CHAIN } from "../helpers/chains";
import { getFeesFromVaultCounters } from "../helpers/ethereum-l2";
import { METRIC } from "../helpers/metrics";

const CG_TOKEN = 'ethereum';
const SUPPLY_SIDE_LABEL = 'Transaction Gas Fees To Sequencer';
const OPERATOR_FEE_LABEL = 'Transaction Operator Fees';
// OP-stack OperatorFeeVault (Isthmus). Katana charges an operator fee on every non-deposit tx on top
// of the gas price, so it never shows up in gas_price * gas_used. The vault withdraws into the
// BaseFeeVault, so don't add that vault's counters here or every withdrawal is counted twice.
const OPERATOR_FEE_VAULT = '0x420000000000000000000000000000000000001b';

const fetch = async (options: FetchOptions) => {
  const query = `
    SELECT SUM(gas_price * receipt_gas_used) AS tx_fees
    FROM katana.raw.transactions
    WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
      AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
  `;

  const [res, operatorFees] = await Promise.all([
    queryAllium(query),
    getFeesFromVaultCounters(options, { feeVaults: [OPERATOR_FEE_VAULT], CGToken: CG_TOKEN }),
  ]);
  if (!res?.[0]) {
    throw new Error(`Allium returned no rows for Katana fees on ${options.dateString}`);
  }

  const dailyFees = options.createBalances();
  dailyFees.addCGToken(CG_TOKEN, Number(res[0].tx_fees ?? 0) / 1e18, METRIC.TRANSACTION_GAS_FEES);
  dailyFees.addBalances(operatorFees, OPERATOR_FEE_LABEL);
  const dailySupplySideRevenue = dailyFees.clone(1, SUPPLY_SIDE_LABEL);

  return { dailyFees, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.KATANA],
  start: '2025-05-08',
  protocolType: ProtocolType.CHAIN,
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology: {
    Fees: 'Transaction fees paid by users for executing transactions on Katana, including the OP-stack operator fee. Excludes the L1 data fee.',
    SupplySideRevenue: 'Transaction fees, operator fee included, paid to the Katana sequencer and validators.',
    Revenue: 'Katana does not retain transaction fees as protocol revenue.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRANSACTION_GAS_FEES]: 'Gas fees paid by users for executing transactions on Katana.',
      [OPERATOR_FEE_LABEL]: 'OP-stack operator fee charged on every non-deposit transaction, collected in the OperatorFeeVault.',
    },
    SupplySideRevenue: {
      [SUPPLY_SIDE_LABEL]: 'Gas fees and operator fees paid to the Katana sequencer and validators.',
    },
  },
};

export default adapter;
