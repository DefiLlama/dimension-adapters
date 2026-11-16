import { Dependencies, SimpleAdapter, ProtocolType, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryAllium } from "../helpers/allium";

const fetch = async (options: FetchOptions) => {
  // storage cost is a deposit that is rebated when the object is deleted, so only computation and the
  // non-refundable part are counted; gas_fees_mist nets rebates against new storage and goes negative
  // on deletion-heavy hours
  const query = `
    SELECT 
        sum(gas_computation_cost) as computation_fees,
        sum(gas_non_refundable_storage_fee) as storage_fee_burnt
    FROM ${options.chain}.raw.transaction_blocks
    WHERE checkpoint_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
      AND checkpoint_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
  `;

  const res = await queryAllium(query);
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  if (res[0]?.computation_fees == null)
    throw new Error(`Allium returned no Sui transactions for ${options.startTimestamp}-${options.endTimestamp}`);
  const computationFees = Number(res[0].computation_fees) / 10 ** 9;
  const storageFeeBurnt = Number(res[0].storage_fee_burnt ?? 0) / 10 ** 9;

  dailyFees.addCGToken('sui', computationFees, 'Transaction Gas Fees');
  dailyFees.addCGToken('sui', storageFeeBurnt, 'Transaction Storage Fees');
  dailyRevenue.addCGToken('sui', storageFeeBurnt, 'Transaction Storage Fees');
  dailySupplySideRevenue.addCGToken('sui', computationFees, 'Transaction Gas Fees');

  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue: dailyRevenue,
    dailySupplySideRevenue,
  }
}

const methodology = {
  Fees: "Computation fees plus non refundable storage fees paid by users for executing transactions on the Sui network. Refundable storage deposits are excluded.",
  Revenue: "Non refundable storage fees, retained permanently in the storage fund (never refunded or withdrawn)",
  HoldersRevenue: "Non refundable storage fees, retained permanently in the storage fund (never refunded or withdrawn)",
  SupplySideRevenue: "Computation fees, paid out to validators and stakers at the end of each epoch",
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SUI],
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  protocolType: ProtocolType.CHAIN,
  methodology,
  start: '2024-06-01',
  breakdownMethodology: {
    Fees: {
      'Transaction Gas Fees': 'Computation fees paid by users for executing transactions on the Sui network',
      'Transaction Storage Fees': 'Part of the storage deposit that is kept when an object is deleted instead of being rebated',
    },
    Revenue: {
      'Transaction Storage Fees': 'Non refundable storage fees, retained permanently in the storage fund (never refunded or withdrawn)',
    },
    HoldersRevenue: {
      'Transaction Storage Fees': 'Non refundable storage fees, retained permanently in the storage fund (never refunded or withdrawn)',
    },
    SupplySideRevenue: {
      'Transaction Gas Fees': 'Computation fees, paid out to validators and stakers at the end of each epoch',
    },
  }
};

export default adapter;
