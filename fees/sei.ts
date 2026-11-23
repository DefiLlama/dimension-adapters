import { CHAIN } from "../helpers/chains";
import { SimpleAdapter, ProtocolType, FetchOptions, Dependencies } from "../adapters/types";
import { queryAllium } from "../helpers/allium";
import ADDRESSES from "../helpers/coreAssets.json";
import { METRIC } from "../helpers/metrics";

const SUPPLY_SIDE_LABEL = 'Transaction Gas Fees To Validators And Delegators';
const LOCKED_LABEL = 'Excess Gas Fees Locked In EVM Module';

const V6_2_0_HEIGHT = 174967675

const fetch = async (options: FetchOptions) => {
  const query = `
    SELECT
      SUM(t.receipt_gas_used * t.receipt_effective_gas_price) AS fees_in_wei,
      SUM(IFF(t.block_number < ${V6_2_0_HEIGHT} AND t.transaction_type = 2,
        t.receipt_gas_used * (t.receipt_effective_gas_price - LEAST(t.receipt_effective_gas_price, b.base_fee_per_gas + t.max_priority_fee_per_gas)),
        0)) AS locked_fees_in_wei,
      COUNT_IF(t.block_number < ${V6_2_0_HEIGHT} AND t.transaction_type = 2 AND b.base_fee_per_gas IS NULL) AS missing_base_fee
    FROM sei.raw.transactions t
    LEFT JOIN sei.raw.blocks b ON b.number = t.block_number
      AND b.timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND b.timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
    WHERE t.block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND t.block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
  `
  const [row] = await queryAllium(query);
  if (Number(row.missing_base_fee) > 0) throw new Error(`sei: ${row.missing_base_fee} pre-v6.2.0 EIP-1559 txs have no block base fee`);

  // SUM is NULL on days before EVM went live
  const fees = Number(row.fees_in_wei) || 0;
  const lockedFees = Number(row.locked_fees_in_wei) || 0;

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  dailyFees.add(ADDRESSES.sei.WSEI, fees, METRIC.TRANSACTION_GAS_FEES);
  dailyRevenue.add(ADDRESSES.sei.WSEI, lockedFees, LOCKED_LABEL);
  dailySupplySideRevenue.add(ADDRESSES.sei.WSEI, fees - lockedFees, SUPPLY_SIDE_LABEL);

  return { dailyFees, dailyRevenue, dailySupplySideRevenue };
}

const methodology = {
  Fees: 'EVM transaction gas fees paid by users on Sei; native Cosmos transaction fees are not included.',
  Revenue: 'Before the v6.2.0 upgrade (October 23, 2025), EIP-1559 transactions paid their full max fee per gas but only base fee plus tip went to validators, the excess stayed locked in the EVM module account. Since v6.2.0 Sei keeps none of the EVM gas fees.',
  SupplySideRevenue: 'EVM transaction gas fees distributed to validators and delegators: all of them since the v6.2.0 upgrade (October 23, 2025), base fee plus tip per gas before it.',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.TRANSACTION_GAS_FEES]: 'EVM transaction gas fees paid by users on Sei (gas used x effective gas price).',
  },
  Revenue: {
    [LOCKED_LABEL]: 'Before v6.2.0 (October 23, 2025), the part of an EIP-1559 transaction fee above base fee plus tip, which Sei moved to the EVM module account instead of the fee collector. Zero since v6.2.0.',
  },
  SupplySideRevenue: {
    [SUPPLY_SIDE_LABEL]: 'EVM transaction gas fees sent to the fee collector and distributed to validators and delegators.',
  },
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SEI],
  start: '2023-04-21',
  dependencies: [Dependencies.ALLIUM],
  protocolType: ProtocolType.CHAIN,
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology,
}

export default adapter;
