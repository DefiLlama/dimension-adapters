import { Dependencies, SimpleAdapter, ProtocolType, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryAllium } from "../helpers/allium";

const fetch = async (options: FetchOptions) => {
  const start = new Date(options.fromTimestamp * 1000).toISOString()
  const end = new Date(options.toTimestamp * 1000).toISOString()

  const query = `
    SELECT 
        fee_denom,
        coalesce(sum(fee_amount), 0) as tx_fees
    FROM osmosis.raw.transactions
    where block_timestamp BETWEEN '${start}' AND '${end}'
    group by fee_denom
  `;

  const res = await queryAllium(query);
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  for (const row of res) {
    dailyFees.add(row.fee_denom, row.tx_fees, "Transaction Fees");
    dailySupplySideRevenue.add(row.fee_denom, row.tx_fees, "Transaction Fees to Validators");
  }

  return {
    dailyFees,
    dailyRevenue: 0,
    dailyHoldersRevenue: 0,
    dailySupplySideRevenue,
  }
}

const methodology = {
  Fees: "Transaction fees paid by users for executing transactions on the Osmosis network",
  Revenue: 'No revenue',
  HoldersRevenue: 'None of the transaction fees are burnt',
  SupplySideRevenue: 'All the transaction fees are distributed to validators',
}
const breakdownMethodology = {
  Fees: {
    "Transaction Fees": "Transaction fees paid by users for executing transactions on the Osmosis network",
  },
  SupplySideRevenue: {
    "Transaction Fees to Validators": "All the transaction fees are distributed to validators",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.OSMOSIS],
  start: '2021-06-18',
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  protocolType: ProtocolType.CHAIN,
  methodology,
  breakdownMethodology,
};

export default adapter;