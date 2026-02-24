import { FetchOptions, FetchResultV2 } from "../../adapters/types";
import { queryDune } from "../../helpers/dune";
import { getDefaultDexTokensBlacklisted } from "../../helpers/lists";
import { CHAIN } from "../../helpers/chains";
import { getConfig } from "../../helpers/cache";

function formatAddress(address: any): string {
  return String(address).toLowerCase();
}

export async function getBscTokenLists(): Promise<Array<string>> {
  const blacklisted = getDefaultDexTokensBlacklisted(CHAIN.BSC)
  const lists = [
    'https://tokens.pancakeswap.finance/pancakeswap-extended.json',
    'https://tokens.pancakeswap.finance/ondo-rwa-tokens.json',
    'https://tokens.coingecko.com/binance-smart-chain/all.json',
  ];
  let tokens: Array<string> = [];
  for (const url of lists) {
    const data = await getConfig(`pcs-token-list-bsc-${url}`, url);
    tokens = tokens.concat(
      data.tokens
        .filter((token: any) => Number(token.chainId) === 56)
        .map((token: any) => formatAddress(token.address))
    );
  }
  
  return tokens.filter((token: string) => !blacklisted.includes(token))
}

export const PANCAKESWAP_V2_QUERY = (fromTime: number, toTime: number, whitelistedTokens: Array<string>) => {
  return `
    SELECT
        token_bought_address AS token
        , SUM(
          CASE 
              WHEN token_sold_address IN (${whitelistedTokens.toString()})
              AND token_bought_address IN (${whitelistedTokens.toString()})
              THEN token_bought_amount_raw 
              ELSE 0 
          END
        ) AS amount
    FROM dex.trades
    WHERE blockchain = 'bnb'
      AND project = 'pancakeswap'
      AND version = '2'
      AND block_time >= FROM_UNIXTIME(${fromTime})
      AND block_time <= FROM_UNIXTIME(${toTime})
    GROUP BY
        token_bought_address
  `;
}

export async function getBscV2Data(options: FetchOptions): Promise<FetchResultV2> {
  const dailyVolume = options.createBalances()

  const whitelistedTokens = await getBscTokenLists()

  const tokensAndAmounts = await queryDune('3996608',{
    fullQuery: PANCAKESWAP_V2_QUERY(options.fromTimestamp, options.toTimestamp, whitelistedTokens),
  }, options);

  for (const tokenAndAmount of tokensAndAmounts) {
    if (whitelistedTokens.includes(formatAddress(tokenAndAmount.token))) {
      dailyVolume.add(tokenAndAmount.token, tokenAndAmount.amount)
    }
  }

  return {
    dailyVolume: dailyVolume,
    dailyFees: dailyVolume.clone(0.0025),
    dailyUserFees: dailyVolume.clone(0.0025),
    dailyRevenue: dailyVolume.clone(0.0008),
    dailySupplySideRevenue: dailyVolume.clone(0.0017),
    dailyProtocolRevenue: dailyVolume.clone(0.000225),
    dailyHoldersRevenue: dailyVolume.clone(0.000575),
  }
}
