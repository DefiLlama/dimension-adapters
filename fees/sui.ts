import { Dependencies, SimpleAdapter, ProtocolType, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryAllium } from "../helpers/allium";

const fetch = async (options: FetchOptions) => {
  const start = new Date(options.fromTimestamp * 1000).toISOString()
  const end = new Date(options.toTimestamp * 1000).toISOString()

  const query = `
    SELECT 
        sum(gas_fees_mist) as tx_fees,
        sum(gas_non_refundable_storage_fee) as storage_fee_burnt
    FROM ${options.chain}.raw.transaction_blocks
    where _created_at BETWEEN '${start}' AND '${end}'
  `;

  const res = await queryAllium(query);
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  dailyFees.addCGToken('sui', res[0].tx_fees / 10 ** 9);
  dailyRevenue.addCGToken('sui', res[0].storage_fee_burnt / 10 ** 9);

  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue: dailyRevenue,
  }
}

const methodology = {
  Fees: "Transaction fees paid by users for executing transactions on the Sui network",
  Revenue: "Includes non refundable storage fees that are burnt",
  HoldersRevenue: "Includes non refundable storage fees that are burnt",
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
};

export default adapter;
