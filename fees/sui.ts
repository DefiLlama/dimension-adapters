import { Dependencies, SimpleAdapter, ProtocolType, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryAllium } from "../helpers/allium";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const start = new Date(options.fromTimestamp * 1000).toISOString()
  const end = new Date(options.toTimestamp * 1000).toISOString()

  const query = `
    SELECT 
        sum(gas_fees_mist) as tx_fees
    FROM ${options.chain}.raw.transaction_blocks
    where _created_at BETWEEN '${start}' AND '${end}'
  `;

  const res = await queryAllium(query);
  const dailyFees = options.createBalances();
  dailyFees.addCGToken('sui', res[0].tx_fees / 10 ** 9)

  return {
    dailyFees,
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SUI],
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  protocolType: ProtocolType.CHAIN,
};

export default adapter;
