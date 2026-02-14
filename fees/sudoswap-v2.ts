import { Adapter, FetchOptions, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryIndexer } from "../helpers/indexer";

const PROTOCOL_FEE_LABEL = "Protocol fees";
const ROYALTY_FEE_LABEL = "Creator royalties";

const fetch = async (timestamp: number, _: any, options: FetchOptions): Promise<FetchResultFees> => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const eth_transfer_logs: any = await queryIndexer(`
      SELECT
        sum("value") AS eth_value
      FROM
        ethereum.traces
      WHERE
        block_number > 17309203
        AND to_address = '\\xA020d57aB0448Ef74115c112D18a9C231CC86000'
        AND block_time BETWEEN llama_replace_date_range;
        `, options);
  const royalties: any = await queryIndexer(`
        WITH MinValues AS (
          SELECT
            transaction_hash,
            from_address,
            MIN("value") AS min_value
          FROM
            ethereum.traces
          WHERE
            block_number > 17309203
            AND block_time BETWEEN llama_replace_date_range
            AND from_address IN (
              SELECT
              SUBSTRING(topic_1 FROM 13 FOR 20)::bytea AS extracted_bytea
            FROM
              ethereum.event_logs
            WHERE
              block_number > 17309203
              AND contract_address = '\\xA020d57aB0448Ef74115c112D18a9C231CC86000'
              AND topic_0 = '\\xe8e1cee58c33f242c87d563bbc00f2ac82eb90f10a252b0ba8498ae6c1dc241a'
              )
            AND to_address != '\\xA020d57aB0448Ef74115c112D18a9C231CC86000'
            and value > 0
            GROUP BY transaction_hash, from_address
            HAVING COUNT(transaction_hash) > 1
        )
        SELECT
          SUM(min_value) AS royalties_fees
        FROM MinValues;
        `, options);
  dailyFees.addGasToken(eth_transfer_logs[0].eth_value, PROTOCOL_FEE_LABEL)
  dailyFees.addGasToken(royalties[0].royalties_fees, ROYALTY_FEE_LABEL)
  dailyRevenue.addGasToken(eth_transfer_logs[0].eth_value, PROTOCOL_FEE_LABEL)
  return { dailyFees, dailyRevenue, timestamp }
}

const methodology = {
  Fees: "Protocol fees and creator royalties collected on NFT trades",
  Revenue: "Protocol fees retained by sudoswap, excluding creator royalties paid to NFT creators"
}

const breakdownMethodology = {
  Fees: {
    [PROTOCOL_FEE_LABEL]: "Protocol fees charged on NFT trades through sudoswap v2 AMM pools",
    [ROYALTY_FEE_LABEL]: "Creator royalties paid to NFT collection creators on secondary sales"
  },
  Revenue: {
    [PROTOCOL_FEE_LABEL]: "Protocol fees retained by sudoswap from NFT trades"
  }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch as any,
      start: '2023-05-21'
    },
  },
  methodology,
  breakdownMethodology
};

export default adapter;
