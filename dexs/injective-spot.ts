import { FetchOptions, FetchResultV2, FetchV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";
import BigNumber from "bignumber.js";

const INJECTIVE_TRADES_V1 =
  "https://sentry.exchange.grpc-web.injective.network/api/exchange/spot/v2/trades";

const INJECTIVE_MARKETS_V1 =
  "https://sentry.exchange.grpc-web.injective.network/api/exchange/spot/v1/markets";

const INJECTIVE_TOKEN_METADATA =
  "https://sentry.exchange.grpc-web.injective.network/api/exchange/meta/v1/tokenMetadata";

interface SpotTrade {
  marketId?: string;
  price?: {
    price?: string;
    quantity?: string;
  };
}

interface TradesResponseV1 {
  paging?: { total?: number; from?: number; to?: number };
  trades?: SpotTrade[];
}

interface Market {
  marketId: string;
  marketStatus: string;
  quoteDenom: string;
  quoteTokenMeta?: { 
    decimals?: number;
  };
  baseTokenMeta?: {
    decimals?: number;
  };
}

interface MarketsResponseV1 {
  markets?: Market[];
}

interface TokenMetadata {
  coingeckoId?: string;
  denom: string;
  name?: string;
  symbol?: string;
  decimals: number;
}

interface TokenMetadataResponse {
  tokens?: TokenMetadata[];
}

interface MarketInfo {
  quoteDenom: string;
  quoteDecimals: number;
  baseDecimals: number;
  coingeckoId?: string;
  tokenDecimals: number;
}

// Fetch and cache token metadata from Injective
async function getTokenMetadataMap(): Promise<Map<string, TokenMetadata>> {
  const resp: TokenMetadataResponse = await httpGet(INJECTIVE_TOKEN_METADATA);
  const map = new Map<string, TokenMetadata>();

  for (const token of resp.tokens || []) {
    map.set(token.denom, token);
  }

  return map;
}

async function getMarketsInfo(tokenMetadataMap: Map<string, TokenMetadata>): Promise<Map<string, MarketInfo>> {
  const resp: MarketsResponseV1 = await httpGet(INJECTIVE_MARKETS_V1);
  const map = new Map<string, MarketInfo>();

  for (const m of resp.markets || []) {
    // Only include active markets
    if (m.marketStatus !== "active") continue;

    const quoteDenom = m.quoteDenom;
    const quoteDecimals = m.quoteTokenMeta?.decimals;
    const baseDecimals = m.baseTokenMeta?.decimals;
    
    const tokenMetadata = tokenMetadataMap.get(quoteDenom);
    const coingeckoId = tokenMetadata?.coingeckoId && tokenMetadata.coingeckoId.trim() !== "" 
      ? tokenMetadata.coingeckoId 
      : undefined;
    const tokenDecimals = tokenMetadata?.decimals ?? Number(quoteDecimals);

    map.set(m.marketId, {
      quoteDenom,
      quoteDecimals: Number(quoteDecimals),
      baseDecimals: Number(baseDecimals),
      coingeckoId,
      tokenDecimals: Number(tokenDecimals),
    });
  }

  return map;
}

interface VolumeResult {
  coingeckoId?: string;
  quoteDenom: string;
  volume: number;
  hasCoinGeckoId: boolean;
}

async function fetchMarketVolume(
  marketId: string,
  marketInfo: MarketInfo,
  startMs: number,
  endMs: number
): Promise<VolumeResult | null> {
  let skip = 0;
  const limit = 100;
  let totalVolume = new BigNumber(0);

  while (true) {
    const url =
      `${INJECTIVE_TRADES_V1}` +
      `?marketId=${marketId}` +
      `&executionSide=taker` +
      `&startTime=${startMs}` +
      `&endTime=${endMs}` +
      `&limit=${limit}` +
      `&skip=${skip}`;
  
    const resp: TradesResponseV1 = await httpGet(url);
    const trades = resp.trades || [];
  
    if (!trades.length) break;
  
    for (const t of trades) {
      const price = new BigNumber(t.price?.price ?? 0);
      const quantity = new BigNumber(t.price?.quantity ?? 0);
      
      const volumeInQuote = price.times(quantity).div(Math.pow(10, marketInfo.quoteDecimals));
      totalVolume = totalVolume.plus(volumeInQuote);
    }

    if (trades.length < limit) break;
    
    skip += limit;
  }

  if (marketInfo.coingeckoId) {
    return {
      coingeckoId: marketInfo.coingeckoId,
      quoteDenom: marketInfo.quoteDenom,
      volume: totalVolume.toNumber(),
      hasCoinGeckoId: true
    };
  } else {
    return {
      quoteDenom: marketInfo.quoteDenom,
      volume: totalVolume.times(Math.pow(10, marketInfo.tokenDecimals)).toNumber(),
      hasCoinGeckoId: false
    };
  }
}

const fetch: FetchV2 = async (
  options: FetchOptions
): Promise<FetchResultV2> => {

  const startMs = options.startTimestamp * 1000;
  const endMs = options.endTimestamp * 1000;

  // Fetch token metadata
  const tokenMetadataMap = await getTokenMetadataMap();
  
  // Get market information
  const marketsInfo = await getMarketsInfo(tokenMetadataMap);
  
  const results = await Promise.all(
    Array.from(marketsInfo.entries()).map(([marketId, marketInfo]) =>
      fetchMarketVolume(marketId, marketInfo, startMs, endMs)
    )
  );

  const volumeByCGToken = new Map<string, number>();
  const volumeByDenom = new Map<string, number>();

  for (const result of results) {
    if (!result) continue;

    if (result.hasCoinGeckoId && result.coingeckoId) {
      const current = volumeByCGToken.get(result.coingeckoId) || 0;
      volumeByCGToken.set(result.coingeckoId, current + result.volume);
    } else {
      const current = volumeByDenom.get(result.quoteDenom) || 0;
      volumeByDenom.set(result.quoteDenom, current + result.volume);
    }
  }

  const dailyVolume = options.createBalances();

  for (const [coingeckoId, volume] of volumeByCGToken.entries()) {
    dailyVolume.addCGToken(coingeckoId, volume);
  }

  for (const [denom, volume] of volumeByDenom.entries()) {
    dailyVolume.add(denom, volume);
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.INJECTIVE],
  runAtCurrTime: true,
  start: "2021-07-17",
  methodology: {
    Volume:
      "Sum of (price * quantity) over taker-side trades across all active Injective spot markets within the 24h window.",
  },
};

export default adapter;