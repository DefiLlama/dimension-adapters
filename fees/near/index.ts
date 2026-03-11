import { Adapter, Dependencies, FetchOptions, ProtocolType } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";

interface ChartData {
  date: string;
  txn_fee_usd: string;
}

const feesAPI = 'https://api.nearblocks.io/v1/charts';

const fetch = async (_timestamp: number, __: any, options: FetchOptions) => {
  const query = `
    SELECT 
        SUM(transaction_fee_raw) AS total_tx_fees
    FROM ${options.chain}.raw.transactions
    WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
    AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
  `;

  const res = await queryAllium(query);
  const dailyFees = options.createBalances();
  dailyFees.addCGToken('near', res[0].total_tx_fees / 1e24)

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
};

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.NEAR],
  start: '2020-07-21',
  dependencies: [Dependencies.ALLIUM],
  protocolType: ProtocolType.CHAIN,
  methodology: {
    Fees: "We fetch daily transaction fees from NearBlocks API. The data is aggregated daily and includes all transaction fees paid on the NEAR blockchain. 70% of transaction fees are burned, while 30% can optionally be allocated to smart contract developers as rewards if they specify a fee percentage for their contracts (otherwise 100% is burned). Note that validators do not earn transaction fees - their rewards come from protocol-level inflation.",
    Revenue: "All fees paid by users while using Near blockchain.",
  },
};

export default adapter;
