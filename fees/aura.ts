import { Adapter, FetchOptions, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryIndexer } from "../helpers/indexer";

const BAL_TOKEN = '0xba100000625a3754423978a60c9317c58a424e3D';

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();


  // bal vote
  const bal_transfer_logs = await queryIndexer(`
        SELECT
          substr(encode(topic_1, 'hex'), 25) AS origin,
          substr(encode(topic_2, 'hex'), 25) AS destination,
          encode(transaction_hash, 'hex') AS HASH,
          encode(data, 'hex') AS data
        FROM
          ethereum.event_logs
        WHERE
          block_number > 14932175
          AND contract_address = '\\xba100000625a3754423978a60c9317c58a424e3D'
          AND topic_0 = '\\xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
          AND topic_1 in('\\x00000000000000000000000026743984e3357eFC59f2fd6C1aFDC310335a61c9', '\\x000000000000000000000000d3cf852898b21fc233251427c2dc93d3d604f3bb')
          AND topic_2 = '\\x000000000000000000000000aF52695E1bB01A16D33D7194C28C42b10e0Dbec2'
          AND block_time BETWEEN llama_replace_date_range;
      `, options);

  // bal vote
  const bal_bal_yield_logs = await queryIndexer(`
        SELECT
          substr(encode(topic_1, 'hex'), 25) AS origin,
          substr(encode(topic_2, 'hex'), 25) AS destination,
          encode(transaction_hash, 'hex') AS HASH,
          encode(data, 'hex') AS data
        FROM
          ethereum.event_logs
        WHERE
          block_number > 14932175
          AND contract_address = '\\xba100000625a3754423978a60c9317c58a424e3D'
          AND topic_0 = '\\xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
          AND topic_1 not in('\\x00000000000000000000000026743984e3357eFC59f2fd6C1aFDC310335a61c9', '\\x000000000000000000000000d3cf852898b21fc233251427c2dc93d3d604f3bb')
          AND topic_2 = '\\x000000000000000000000000aF52695E1bB01A16D33D7194C28C42b10e0Dbec2'
          AND block_time BETWEEN llama_replace_date_range;
          `, options);

  // const bbusd_transfer_logs = await queryIndexer(`
  //       SELECT
  //         substr(encode(topic_1, 'hex'), 25) AS origin,
  //         substr(encode(topic_2, 'hex'), 25) AS destination,
  //         encode(transaction_hash, 'hex') AS HASH,
  //         encode(data, 'hex') AS data
  //       FROM
  //         ethereum.event_logs
  //       WHERE
  //         block_number > 14932175
  //         AND contract_address in ('\\xA13a9247ea42D743238089903570127DdA72fE44','\\x7b50775383d3d6f0215a8f290f2c9e2eebbeceb2', '\\xfebb0bbf162e64fb9d0dfe186e517d84c395f016')
  //         AND topic_0 = '\\xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
  //         AND topic_1 in('\\x00000000000000000000000026743984e3357eFC59f2fd6C1aFDC310335a61c9', '\\x000000000000000000000000d3cf852898b21fc233251427c2dc93d3d604f3bb')
  //         AND topic_2 = '\\x000000000000000000000000aF52695E1bB01A16D33D7194C28C42b10e0Dbec2'
  //         AND block_time BETWEEN llama_replace_date_range;
  //         `, options);

  bal_transfer_logs.map((e: any) => {
    dailyFees.add(BAL_TOKEN, '0x' + e.data)
  });

  bal_bal_yield_logs.map((e: any) => {
    dailyFees.add(BAL_TOKEN, '0x' + e.data)
  });


  const dailySupplySideRevenue = dailyFees.clone();
  dailySupplySideRevenue.resizeBy(0.75);
  const dailyRevenue = dailyFees.clone();
  dailyRevenue.resizeBy(0.25);
  const dailyHoldersRevenue = dailyFees.clone();
  dailyHoldersRevenue.resizeBy(0.04);

  return { dailyFees, dailyRevenue, dailySupplySideRevenue, dailyHoldersRevenue, }
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch as any,
      start: '2022-12-01',
    },
  },

}

export default adapter;
