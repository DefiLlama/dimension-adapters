import { CHAIN } from "../helpers/chains";
import { Adapter, ProtocolType, FetchOptions } from "../adapters/types";
import { queryAllium } from "../helpers/allium";
import ADDRESSES from "../helpers/coreAssets.json";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const query = `
    SELECT SUM(receipt_gas_used * receipt_effective_gas_price) AS fees_in_wei
    FROM sei.raw.transactions
    WHERE block_timestamp BETWEEN TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND TO_TIMESTAMP_NTZ(${options.endTimestamp})
  `
  const res = await queryAllium(query);
  const dailyFees = options.createBalances();
  dailyFees.add(ADDRESSES.sei.WSEI, Number(res[0].fees_in_wei) || 0);

  return { dailyFees, dailyRevenue: dailyFees };
}

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SEI],
  start: '2023-04-21',
  protocolType: ProtocolType.CHAIN,
  isExpensiveAdapter: true,
}

export default adapter;
