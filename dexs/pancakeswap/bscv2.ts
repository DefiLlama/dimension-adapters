import { FetchOptions, FetchResultV2 } from "../../adapters/types";
import { queryDune } from "../../helpers/dune";
import { httpGet } from "../../utils/fetchURL";

function formatAddress(address: any): string {
  return String(address).toLowerCase();
}

async function getWhitelistedTokens(): Promise<Array<string>> {
  const data = await httpGet('https://raw.githubusercontent.com/pancakeswap/token-list/main/lists/coingecko.json');
  return data.tokens
    .filter((token: any) => Number(token.chainId) === 56)
    .map((token: any) => formatAddress(token.address))
}

export const PANCAKESWAP_V2_QUERY = (fromTime: number, toTime: number, tokens: Array<string>) => {
  return `
    select
        token_bought_address as token
        , sum(
          CASE 
              WHEN token_sold_address IN (${tokens.toString()})
              AND token_bought_address IN (${tokens.toString()})
              THEN token_bought_amount_raw 
              ELSE 0 
          END
        ) as amount
    from dex.trades
    where blockchain = 'bnb'
      and project = 'pancakeswap'
      and version = '2'
      and block_time >= FROM_UNIXTIME(${fromTime})
      and block_time <= FROM_UNIXTIME(${toTime})
    group by
        token_bought_address
  `;
}

export async function getBscV2Data(options: FetchOptions): Promise<FetchResultV2> {
  const dailyVolume = options.createBalances()

  const whitelistedTokens = await getWhitelistedTokens()

  const tokensAndAmounts = await queryDune('3996608',{
    fullQuery: PANCAKESWAP_V2_QUERY(options.fromTimestamp, options.toTimestamp, whitelistedTokens),
  });

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
    dailyProtocolRevenue: dailyVolume.clone(0.0000225),
    dailyHoldersRevenue: dailyVolume.clone(0.0000575),
  }
}
