import {Adapter, Dependencies, FetchOptions, FetchResultFees} from "../../adapters/types";
import {CHAIN} from "../../helpers/chains";
import {queryDuneSql} from "../../helpers/dune";
// source : https://assets.backed.fi/legal-documentation/product-database
import rawProducts from './backefi_products.json'

type Chains = Record<string, string | undefined>;

interface Product {
  name: string;
  ticker: string;
  chains: Chains;
}

const PRODUCTS: Product[] = rawProducts;
const evmFeeEvents = {
  transferEvent: 'event Transfer(address indexed from, address indexed to, uint256 value)',
}

export function getAddressesByChain(chainName: string): string[] {

  return PRODUCTS
    .map(product => product.chains[chainName])
    .filter((address): address is string => !!address);
}

const fetchEVM: any = async (options: FetchOptions): Promise<FetchResultFees> => {

  let tokens = getAddressesByChain(options.chain);

  const dailyMintAndBurns = options.createBalances()

  const totalSupplyBefore = await options.fromApi.multiCall({
    abi: "erc20:totalSupply",
    calls: tokens,
    permitFailure: true,
  })
  const totalSupplyAfter = await options.toApi.multiCall({
    abi: "erc20:totalSupply",
    calls: tokens,
    permitFailure: true,
  })
  const mintedTokens: string[] = []
  const burnedTokens: string[] = []

  tokens.forEach((v, i) => {
    const supplyAfter = BigInt(totalSupplyAfter[i] ?? 0)
    const supplyBefore = BigInt(totalSupplyBefore[i] ?? 0)

    if (supplyAfter > supplyBefore) {
      mintedTokens.push(v)
    } else if (supplyAfter < supplyBefore) {
      burnedTokens.push(v)
    }
  })

  if (mintedTokens.length > 0) {
    // fetch mintEvents
    const mintEvents: Array<any> = await options.getLogs({
      targets: tokens,
      eventAbi: evmFeeEvents.transferEvent,
      entireLog: true,
      topics: [
        '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
        '0x0000000000000000000000000000000000000000000000000000000000000000',
      ]
    })
    for (const event of mintEvents) {
      dailyMintAndBurns.addToken(event.address, event.args[2]);
    }
  }

  if (burnedTokens.length > 0) {
    // fetch burnEvents
    const burnEvents: Array<any> = await options.getLogs({
      targets: tokens,
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

  let tokens = getAddressesByChain(options.chain);

  const dailyMintAndBurns = options.createBalances()

  const valuesClause = tokens
    .map(address => `('${address}')`)
    .join(',\n            ');

  const sql = `
      WITH target_mints AS (SELECT mint
                            FROM (VALUES ${valuesClause}) AS t(mint)),
           raw_events AS (SELECT CASE
                                     WHEN bytearray_substring(data, 1, 1) = 0x07 THEN account_arguments[1]
                                     WHEN bytearray_substring(data, 1, 1) = 0x0f THEN account_arguments[2]
                                     END                                                                  AS mint_address,
                                 CASE
                                     WHEN bytearray_substring(data, 1, 1) = 0x07 THEN 'mintTo'
                                     ELSE 'burnChecked'
                                     END                                                                  AS instruction_type,
                                 bytearray_to_uint256(bytearray_reverse(bytearray_substring(data, 2, 8))) AS amount_raw
                          FROM solana.instruction_calls ic
                          WHERE executing_account = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'
                            AND block_time >= FROM_UNIXTIME(${options.fromTimestamp})
                            AND block_time < FROM_UNIXTIME(${options.toTimestamp})
                            AND tx_success = true
                            AND length(data) >= 1
                            AND bytearray_substring(data, 1, 1) IN (0x07, 0x0f)
                            AND cardinality(account_arguments) >= 2
                            AND (
                              (bytearray_substring(data, 1, 1) = 0x07 AND
                               account_arguments[1] IN (SELECT mint FROM target_mints))
                                  OR
                              (bytearray_substring(data, 1, 1) = 0x0f AND
                               account_arguments[2] IN (SELECT mint FROM target_mints))
                              ))
      SELECT mint_address,
             SUM(CASE WHEN instruction_type = 'mintTo' THEN amount_raw ELSE 0 END)             AS total_minted,
             SUM(CASE WHEN instruction_type = 'burnChecked' THEN amount_raw ELSE 0 END)        AS total_burned,
             (SUM(CASE WHEN instruction_type = 'mintTo' THEN amount_raw ELSE 0 END)
                 + SUM(CASE WHEN instruction_type = 'burnChecked' THEN amount_raw ELSE 0 END)) AS total
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
  adapter:
    {
      [CHAIN.ETHEREUM]: {
        fetch: fetchEVM,
        start: '2022-12-22',
      },
      [CHAIN.XDAI]: {
        fetch: fetchEVM,
        start: '2023-02-12',
      },
      [CHAIN.POLYGON]: {
        fetch: fetchEVM,
        start: '2023-06-06',
      },
      [CHAIN.ARBITRUM]: {
        fetch: fetchEVM,
        start: '2023-08-11',
      },
      [CHAIN.AVAX]: {
        fetch: fetchEVM,
        start: '2023-08-10',
      },
      [CHAIN.BSC]: {
        fetch: fetchEVM,
        start: '2023-08-10',
      },
      [CHAIN.BASE]: {
        fetch: fetchEVM,
        start: '2023-08-30',
      },
      [CHAIN.MANTLE]: {
        fetch: fetchEVM,
        start: '2025-11-27',
      },
      [CHAIN.SOLANA]: {
        fetch: fetchSolana,
        start: '2025-06-10',
      },
      // Deliberately ignored fantom, there is no activity on any of fantom tokens since deployment date, waste of resources to track
      // TODO : track newly added tokens on TON
    },
  methodology: {
    Fees: "Up to 0.50% of your investment's value is charged when entering and exiting the investment",
    Revenue: 'All fees are revenue for the protocol',
  }
};
export default adapters;
