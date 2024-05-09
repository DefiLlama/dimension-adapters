import { Adapter, FetchOptions, } from "../../adapters/types";
import { queryIndexer } from "../../helpers/indexer";
import { getTokenDiff } from "../../helpers/token";

/** Address to check = paalecosystemfund.eth */
const CONTRACT_ADDRESS = "0x54821d1B461aa887D37c449F3ace8dddDFCb8C0a";

const fetch: any = async (timestamp: number, _: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  await getTokenDiff({ target: CONTRACT_ADDRESS, options, includeGasToken: true, balances: dailyFees, })
  const transactions = await queryIndexer(`
    SELECT
      block_number,
      block_time,
      "value" as eth_value,
      encode(transaction_hash, 'hex') AS HASH,
      encode(to_address, 'hex') AS to_address
    FROM
      ethereum.traces
    WHERE
      block_number > 17539904
      and to_address = '\\x54821d1B461aa887D37c449F3ace8dddDFCb8C0a'
      and error is null
      AND block_time BETWEEN llama_replace_date_range;
      `, options);

  transactions.map((transaction: any) => dailyFees.addGasToken(transaction.eth_value))
  return { timestamp, dailyFees, }
}

/** Adapter */
const adapter: Adapter = {
  adapter: {
    ethereum: {
      fetch,
      start: 1690070400,
    },
  },
}

export default adapter;
