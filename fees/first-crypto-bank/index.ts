
import { Adapter, FetchOptions, } from "../../adapters/types";
import { queryIndexer } from "../../helpers/indexer";


/** Calculate USD equivalent for a given ether amount */
const fetch: any = async (timestamp: number, _: any, options: FetchOptions) => {

  const dailyFees = options.createBalances();

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
          block_number > 18844736
          and to_address = '\\x67262A61c0A459Fff172c22E60DBC730393BF790'
          and error is null
          AND block_time BETWEEN llama_replace_date_range;
          `, options);
  transactions.map((transaction: any) => dailyFees.addGasToken(transaction.eth_value))
  return { timestamp, dailyFees, }
}

const adapter: Adapter = {
  adapter: {
    ethereum: {
      fetch,
      start: 1703203200,
    },
  },
}

export default adapter;
