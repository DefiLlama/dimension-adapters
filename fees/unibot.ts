import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryIndexer, toByteaArray } from "../helpers/indexer";

const fetch: any = async (timestamp: number, _: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyTokenTaxes = options.createBalances();

  const to_address = ["0x27B9c20f64920EB7fBF64491423a54DF9594188C"]
  const transactions_v2 = await queryIndexer(`
      SELECT
        sum ("value") as value
      FROM
        ethereum.traces
      WHERE
        block_number > 17341451
        and to_address in ${toByteaArray(to_address, { skipBytea: true })}
        AND block_time BETWEEN llama_replace_date_range
        `, options);

  const transactions = await queryIndexer(`
        SELECT
          block_number,
          block_time,
          "value",
          encode(transaction_hash, 'hex') AS HASH,
          encode(to_address, 'hex') AS to_address
        FROM
          ethereum.traces
        WHERE
            block_number > 17447804
            and to_address = '\\x3999D2c5207C06BBC5cf8A6bEa52966cabB76d41'
            AND from_address = '\\xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
            AND block_time BETWEEN llama_replace_date_range
      UNION ALL
        SELECT
          block_number,
          block_time,
          "value",
          encode(transaction_hash, 'hex') AS HASH,
          encode(to_address, 'hex') AS to_address
        FROM
          ethereum.traces
        WHERE
            block_number > 17447804
            and from_address = '\\x3999D2c5207C06BBC5cf8A6bEa52966cabB76d41'
            AND to_address = '\\xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
            AND block_time BETWEEN llama_replace_date_range
            `, options);

  transactions.map((p: any) => dailyFees.addGasToken(p.value * 0.01))
  transactions_v2.map((p: any) => dailyFees.addGasToken(p.value))


  const revFromToken = await queryIndexer(`
        SELECT
          block_number,
          block_time,
          "value",
          encode(transaction_hash, 'hex') AS HASH,
          encode(to_address, 'hex') AS to_address
        FROM
          ethereum.traces
        WHERE
          block_number > 17277183
          AND from_address = '\\xf819d9cb1c2a819fd991781a822de3ca8607c3c9'
          AND block_time BETWEEN llama_replace_date_range
          `, options);
  revFromToken.concat(transactions_v2).map((p: any) => dailyTokenTaxes.addGasToken(p.value))

  // ref https://dune.com/queries/2621049/4349967
  return { timestamp, dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees, dailyTokenTaxes }

}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      start: '2023-05-25',
    },
  },
  methodology: {
    Fees: 'All trading fees paid by users.',
    Revenue: 'All trading fees paid by users.',
    HoldersRevenue: 'Fees distributed to token holders',
    ProtocolRevenue: 'All trading fees paid by users.',
  }
};

export default adapter;
