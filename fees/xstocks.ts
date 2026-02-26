import {Adapter, Dependencies, FetchOptions, FetchResultFees} from "../adapters/types";
import {CHAIN} from "../helpers/chains";
import {queryDuneSql} from "../helpers/dune";
import {METRIC} from "../helpers/metrics";
import fetchURL from "../utils/fetchURL";

// Source: https://docs.backed.fi/backed-platform/issuance-and-redemption
// xStocks are tokenized stocks offered by Backed Finance
// Fees are charged on issuance (minting) and redemption (burning)
// Fee structure: No information available yet

interface ApiDeployment {
  address: string;
  network: string;
  wrapperAddress?: string;
}

interface ApiProduct {
  id: string;
  name: string;
  symbol: string;
  isin: string;
  underlyingSymbol: string;
  underlyingIsin: string;
  description: string;
  logo: string;
  isTradingHalted: boolean;
  deployments: ApiDeployment[];
}

interface ApiResponse {
  nodes: ApiProduct[];
  page: {
    currentPage: number;
    hasNextPage: boolean;
  };
}

const CHAIN_NAME_MAP: Record<string, string> = {
  [CHAIN.SOLANA]: 'Solana',
};

let cachedProducts: ApiProduct[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 3600000; // 1 hour

async function getProducts(): Promise<ApiProduct[]> {
  const now = Date.now();
  if (cachedProducts && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedProducts;
  }

  const response: ApiResponse = await fetchURL('https://api.backed.fi/rest/tokens');
  cachedProducts = response.nodes;
  cacheTimestamp = now;
  return cachedProducts;
}

async function getAddressesByChain(chainName: string): Promise<string[]> {
  const products = await getProducts();
  const apiChainName = CHAIN_NAME_MAP[chainName];
  if (!apiChainName) return [];

  const addresses: string[] = [];
  for (const product of products) {
    if (product.isTradingHalted) continue;
    for (const deployment of product.deployments) {
      if (deployment.network === apiChainName) {
        const address = deployment.address.startsWith('svm:') 
          ? deployment.address.substring(4) 
          : deployment.address;
        addresses.push(address);
        break;
      }
    }
  }
  return addresses;
}

interface IData {
  mint_address: string;
  total_minted: number;
  total_burned: number;
  total: number;
}

const fetch: any = async (options: FetchOptions): Promise<FetchResultFees> => {
  const tokens = await getAddressesByChain(options.chain);
  if (tokens.length === 0) return { dailyFees: options.createBalances(), dailyRevenue: options.createBalances() };

  const dailyFees = options.createBalances()

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
    dailyFees.addToken(r.mint_address, Number(r.total) * 0.000, METRIC.MINT_REDEEM_FEES);
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  }
};

const adapter: Adapter = {
  version: 2,
  fetch,
  start: '2025-06-10',
  dependencies: [Dependencies.DUNE],
  methodology: {
    Fees: "Up to 0.50% of your investment's value is charged when entering and exiting xStocks",
    Revenue: 'All fees are revenue for the protocol',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.MINT_REDEEM_FEES]: "Fees charged on issuance (minting) and redemption (burning) of tokenized stocks (xStocks), up to 0.50% on entry and exit"
    }
  }
};

export default adapter;
