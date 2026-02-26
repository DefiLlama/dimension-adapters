import { SimpleAdapter, FetchOptions, Dependencies } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { METRIC } from "../helpers/metrics";
import fetchURL from "../utils/fetchURL";

// Source: https://docs.backed.fi/backed-platform/issuance-and-redemption
// Fees are charged on issuance (minting) and redemption (burning) of backed tokens
// Management Fee The tracker charges no management fee at present.
// Fee structure: https://assets.backed.fi/legal-documentation/product-database
// Issuance / Redemption Fee : Up to 0.50% of your investment's value when entering and exiting the investment
// Management Fee The tracker charges no management fee at present.
// A fee of up to 0.25% per annum may be introduced in the future.

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

const evmFeeEvents = {
  transferEvent: 'event Transfer(address indexed from, address indexed to, uint256 value)',
}

const CHAIN_NAME_MAP: Record<string, string> = {
  [CHAIN.ETHEREUM]: 'Ethereum',
  [CHAIN.XDAI]: 'Gnosis',
  [CHAIN.POLYGON]: 'Polygon',
  [CHAIN.ARBITRUM]: 'Arbitrum',
  [CHAIN.AVAX]: 'Avalanche',
  [CHAIN.BSC]: 'BinanceSmartChain',
  [CHAIN.BASE]: 'Base',
  [CHAIN.MANTLE]: 'Mantle',
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

async function getAddressesByChain(products: ApiProduct[], chainName: string): Promise<string[]> {
  const apiChainName = CHAIN_NAME_MAP[chainName];
  if (!apiChainName) return [];

  const addresses: string[] = [];
  for (const product of products) {
    if (product.isTradingHalted) continue;
    for (const deployment of product.deployments) {
      if (deployment.network === apiChainName) {
        const address = deployment.address.startsWith('svm:')
          ? deployment.address.substring(4)
          : deployment.address.startsWith('ton:')
            ? deployment.address.substring(4)
            : deployment.address;
        addresses.push(address);
        break;
      }
    }
  }
  return addresses;
}

const prefetch = async (options: FetchOptions) => {
  return await getProducts();
}

const fetch = async (_a:any, _b:any, options: FetchOptions) => {
  const products = await options.preFetchedResults;
  const tokens = await getAddressesByChain(products, options.chain);
  if (tokens.length === 0) return { dailyFees: options.createBalances(), dailyRevenue: options.createBalances() };

  const dailyFees = options.createBalances()

  const mintEvents: Array<any> = await options.getLogs({
    targets: tokens,
    eventAbi: evmFeeEvents.transferEvent,
    entireLog: true,
    parseLog: true,
    topics: [
      '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
      '0x0000000000000000000000000000000000000000000000000000000000000000',
      '0x0000000000000000000000005F7A4c11bde4f218f0025Ef444c369d838ffa2aD'
    ]
  })
  for (const event of mintEvents) {
    dailyFees.addToken(event.address, Number(event.args.value) * 0.000, METRIC.MINT_REDEEM_FEES);
  }

  const burnEvents: Array<any> = await options.getLogs({
    targets: tokens,
    eventAbi: evmFeeEvents.transferEvent,
    entireLog: true,
    parseLog: true,
    topics: [
      '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
      null as any,
      '0x0000000000000000000000000000000000000000000000000000000000000000',
    ]
  })
  for (const event of burnEvents) {
    dailyFees.addToken(event.address, Number(event.args.value) * 0.000, METRIC.MINT_REDEEM_FEES);
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  }
};

interface IData {
  token_mint_address: string;
  amount: number;
}

const fetchSolana: any = async (_a:any, _b:any, options: FetchOptions) => {
  const products = await options.preFetchedResults;
  const dailyFees = options.createBalances()

  const tokens = await getAddressesByChain(products, options.chain);
  if (tokens.length === 0) return { dailyFees, dailyRevenue: dailyFees };


  const tokensClause = tokens
    .map(address => `'${address}'`)
    .join(', ');

  const sql = `
    WITH target_tokens AS (
      SELECT token_mint_address
      FROM tokens_solana.fungible
      WHERE token_version = 'spl_token'
        AND token_mint_address IN (${tokensClause})
    ),
    mints AS (
      SELECT
        account_mint AS token_mint_address,
        CAST(amount AS DOUBLE) AS amount
      FROM spl_token_solana.spl_token_call_mintto
      WHERE call_block_time >= from_unixtime(${options.startTimestamp})
        AND call_block_time < from_unixtime(${options.endTimestamp})
        AND account_mint IN (SELECT token_mint_address FROM target_tokens)
    ),
    burns AS (
      SELECT
        account_mint AS token_mint_address,
        CAST(amount AS DOUBLE) AS amount
      FROM spl_token_solana.spl_token_call_burn
      WHERE call_block_time >= from_unixtime(${options.startTimestamp})
        AND call_block_time < from_unixtime(${options.endTimestamp})
        AND account_mint IN (SELECT token_mint_address FROM target_tokens)
    )
    SELECT
      token_mint_address,
      SUM(amount) AS amount
    FROM (
      SELECT * FROM mints
      UNION ALL
      SELECT * FROM burns
    ) combined
    GROUP BY token_mint_address
  `;
  
  const results: IData[] = await queryDuneSql(options, sql);

  for (const r of results) {
    dailyFees.addToken(r.token_mint_address, Number(r.amount) * 0.005, METRIC.MINT_REDEEM_FEES);
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  }
};

const adapters: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: {
    [CHAIN.ETHEREUM]: { start: '2022-12-22' },
    [CHAIN.XDAI]: { start: '2023-02-12' },
    [CHAIN.POLYGON]: { start: '2023-06-06' },
    [CHAIN.ARBITRUM]: { start: '2023-08-11' },
    [CHAIN.AVAX]: { start: '2023-08-10' },
    [CHAIN.BSC]: { start: '2023-08-10' },
    [CHAIN.BASE]: { start: '2023-08-30' },
    [CHAIN.MANTLE]: { start: '2025-11-27' },
    [CHAIN.SOLANA]: { fetch: fetchSolana, start: '2025-06-10' },
  },
  prefetch: prefetch as any,
  dependencies: [Dependencies.DUNE],
  methodology: {
    Fees: "Up to 0.50% of your investment's value is charged when entering and exiting the investment",
    Revenue: 'All fees are revenue for the protocol',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.MINT_REDEEM_FEES]: "Fees charged on issuance (minting) and redemption (burning) of tokenized securities, up to 0.50% on entry and exit"
    },
    Revenue: {
      [METRIC.MINT_REDEEM_FEES]: "Fees charged on issuance (minting) and redemption (burning) of tokenized securities, up to 0.50% on entry and exit"
    }
  }
};

export default adapters;
