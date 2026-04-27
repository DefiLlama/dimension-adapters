import { Dependencies, SimpleAdapter, ProtocolType, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryAllium } from "../helpers/allium";

const PROVENANCE_DECIMALS = 9;

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const start = new Date(options.fromTimestamp * 1000).toISOString()
  const end = new Date(options.toTimestamp * 1000).toISOString()

  const query = `
    SELECT 
        sum(fee_amount) as tx_fees,
    FROM provenance.raw.transactions
    where _created_at BETWEEN '${start}' AND '${end}'
  `;

  const res = await queryAllium(query);
  const dailyFees = options.createBalances();

  dailyFees.addCGToken('hash-2', res[0].tx_fees / 10 ** PROVENANCE_DECIMALS);

  return {
    dailyFees,
    dailyRevenue: 0,
    dailyHoldersRevenue: 0,
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.PROVENANCE],
  start: '2021-05-06',
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  protocolType: ProtocolType.CHAIN,
};

export default adapter;