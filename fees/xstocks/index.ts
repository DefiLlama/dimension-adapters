import {Adapter, Dependencies, FetchOptions, FetchResultFees} from "../../adapters/types";
import {CHAIN} from "../../helpers/chains";
import {queryDuneSql} from "../../helpers/dune";
// source : https://xstocks.fi/products
import PRODUCTS from './xstocks_products.json'

const evmFeeEvents = {
  transferEvent: 'event Transfer(address indexed from, address indexed to, uint256 value)',
}

const fetchEthereum: any = async (options: FetchOptions): Promise<FetchResultFees> => {
  const ethereum_tokens = PRODUCTS.filter(i => i.ethereum_address).flatMap(i => i.ethereum_address);
  const dailyMintAndBurns = options.createBalances()

  // fetch mintEvents
  const mintEvents: Array<any> = await options.getLogs({
    targets: ethereum_tokens,
    eventAbi: evmFeeEvents.transferEvent,
    entireLog: true,
    topics: [
      '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
      '0x0000000000000000000000000000000000000000000000000000000000000000',
    ]
  })
  for (const event of mintEvents) {
    // why can't use event.value when entireLog is true ?
    dailyMintAndBurns.addToken(event.address, event.args[2]);
  }

  // fetch burnEvents
  const burnEvents: Array<any> = await options.getLogs({
    targets: ethereum_tokens,
    eventAbi: evmFeeEvents.transferEvent,
    entireLog: true,
    topics: [
      '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
      null,
      '0x0000000000000000000000000000000000000000000000000000000000000000',
    ]
  })
  for (const event of burnEvents) {
    dailyMintAndBurns.addToken(event.address, event.args[2]);
  }

  return {
    // up to 0.5% is charged on mint and burns
    dailyFees: dailyMintAndBurns.clone(0.005),
    dailyRevenue: dailyMintAndBurns.clone(0.005),
  }
};

interface IData {
  mint_address: string;
  total_minted: number;
  total_burned: number;
  total: number;
}

const fetchSolana: any = async (options: FetchOptions): Promise<FetchResultFees> => {

  const solana_tokens = PRODUCTS.filter(i => i.solana_address).flatMap(i => i.solana_address);

  const dailyMintAndBurns = options.createBalances()

  const valuesClause = solana_tokens
    .map(address => `('${address}')`)
    .join(',\n            ');

  const sql = `
  WITH target_mints AS (
    SELECT mint FROM (VALUES ${valuesClause}) AS t(mint)
  ),
  raw_events AS (
    SELECT
      CASE 
        WHEN bytearray_substring(data,1,1)=0x07 THEN account_arguments[1]
        WHEN bytearray_substring(data,1,1)=0x0f THEN account_arguments[2]
      END AS mint_address,
      CASE 
        WHEN bytearray_substring(data,1,1)=0x07 THEN 'mintTo'
        ELSE 'burnChecked'
      END AS instruction_type,
      bytearray_to_uint256(bytearray_reverse(bytearray_substring(data,2,8))) AS amount_raw
    FROM solana.instruction_calls ic
    WHERE executing_account = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'
      AND block_time >= FROM_UNIXTIME(${options.startTimestamp})
      AND block_time < FROM_UNIXTIME(${options.endTimestamp})
      AND tx_success = true
      AND length(data) >= 1  
      AND bytearray_substring(data,1,1) IN (0x07,0x0f)
      AND cardinality(account_arguments) >= 2
      AND (
        (bytearray_substring(data,1,1)=0x07 AND account_arguments[1] IN (SELECT mint FROM target_mints))
        OR
        (bytearray_substring(data,1,1)=0x0f AND account_arguments[2] IN (SELECT mint FROM target_mints))
      )
  )
  SELECT
    mint_address,
    SUM(CASE WHEN instruction_type='mintTo'      THEN amount_raw ELSE 0 END) AS total_minted,
    SUM(CASE WHEN instruction_type='burnChecked' THEN amount_raw ELSE 0 END) AS total_burned,
    (SUM(CASE WHEN instruction_type='mintTo'      THEN amount_raw ELSE 0 END) 
   + SUM(CASE WHEN instruction_type='burnChecked' THEN amount_raw ELSE 0 END)) AS total
  FROM raw_events
  GROUP BY mint_address
  ORDER BY total DESC;
`;
  const results: IData[] = await queryDuneSql(options, sql);

  for (const r of results) {
    dailyMintAndBurns.addToken(r.mint_address, r.total)
  }

  return {
    dailyFees: dailyMintAndBurns.clone(0.005),
    dailyRevenue: dailyMintAndBurns.clone(0.005),
  }
};


const adapters: Adapter = {
  version: 2,
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  adapter:
    {
      [CHAIN.ETHEREUM]: {
        fetch: fetchEthereum,
        start: '2024-05-02',
      },
      [CHAIN.SOLANA]: {
        fetch: fetchSolana,
        start: '2025-05-25',
      },
    },
  methodology: {
    Fees: "Up to 0.50% of your investment's value is charged when entering and exiting the investment",
    Revenue: 'All fees are revenue for the protocol',
  }
};
export default adapters;
