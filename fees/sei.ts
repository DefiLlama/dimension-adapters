import { CHAIN } from "../helpers/chains";
import { SimpleAdapter, ProtocolType, FetchOptions, Dependencies } from "../adapters/types";
import { queryAllium } from "../helpers/allium";
import ADDRESSES from "../helpers/coreAssets.json";
import { METRIC } from "../helpers/metrics";

const SUPPLY_SIDE_LABEL = 'Transaction Gas Fees To Validators And Delegators';

const fetch = async (options: FetchOptions) => {
  const query = `
    SELECT SUM(receipt_gas_used * receipt_effective_gas_price) AS fees_in_wei
    FROM sei.raw.transactions
    WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
  `
  const res = await queryAllium(query);
  const dailyFees = options.createBalances();
  dailyFees.add(ADDRESSES.sei.WSEI, Number(res[0].fees_in_wei) || 0, METRIC.TRANSACTION_GAS_FEES);
  // Sei sends the EVM base fee and tip to fee_collector without burning them, and mainnet
  // community_tax is 0, so the fees accrue to validators and delegators.
  const dailySupplySideRevenue = dailyFees.clone(1, SUPPLY_SIDE_LABEL);

  return { dailyFees, dailyRevenue: 0, dailySupplySideRevenue };
}

const methodology = {
  Fees: 'EVM transaction gas fees paid by users on Sei; native Cosmos transaction fees are not included.',
  Revenue: 'Sei does not burn or retain EVM transaction gas fees as protocol revenue.',
  SupplySideRevenue: 'EVM transaction gas fees are distributed to validators and delegators.',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.TRANSACTION_GAS_FEES]: 'EVM transaction gas fees paid by users on Sei.',
  },
  SupplySideRevenue: {
    [SUPPLY_SIDE_LABEL]: 'EVM transaction gas fees distributed to validators and delegators.',
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
