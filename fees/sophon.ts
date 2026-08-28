import { Adapter, Dependencies, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const fetch = async (options: FetchOptions) => {
  const now = Date.now();
  const tenHoursAgo = now - (10 * 60 * 60 * 1000);
  if ((options.toTimestamp * 1000) > tenHoursAgo) {
    throw new Error("End timestamp is less than 10 hours ago, skipping due to dune indexing delay");
  }

  const dailyFees = options.createBalances();

  const query = `
    SELECT
      COALESCE(SUM(tx_fee), 0) AS total_fee
    FROM gas.fees
    WHERE blockchain = 'sophon'
      AND block_time >= from_unixtime(${options.startTimestamp})
      AND block_time < from_unixtime(${options.endTimestamp})
  `;

  const res: any[] = await queryDuneSql(options, query);
  dailyFees.addCGToken('sophon', res[0].total_fee);

  return {
    dailyFees,
  };
};

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOPHON],
  start: '2024-12-18',
  protocolType: ProtocolType.CHAIN,
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Fees: 'Transaction fees paid by users on Sophon',
  },
};

export default adapter;
