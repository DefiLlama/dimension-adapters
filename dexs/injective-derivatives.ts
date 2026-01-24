import { FetchOptions, FetchResultV2, FetchV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";
import BigNumber from "bignumber.js";

const INJECTIVE_TRADES_V2 =
  "https://sentry.exchange.grpc-web.injective.network/api/exchange/derivative/v2/trades";

const INJECTIVE_MARKETS_V1 =
  "https://sentry.exchange.grpc-web.injective.network/api/exchange/derivative/v1/markets";

const INJECTIVE_TOKEN_METADATA =
  "https://sentry.exchange.grpc-web.injective.network/api/exchange/meta/v1/tokenMetadata";

interface DerivativeTradeV2 {
  marketId?: string;
  positionDelta?: {
    executionPrice?: string;
    executionQuantity?: string;
  };
}

interface TradesResponseV2 {
  paging?: { total?: number; from?: number; to?: number };
  trades?: DerivativeTradeV2[];
}

interface Market {
  marketId: string;
  marketStatus: string;
  oracleScaleFactor?: number;
  quoteDenom: string;
  quoteTokenMeta?: {
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
  priceScale: number;
  coingeckoId?: string;
  tokenDecimals: number;
}

interface VolumeResult {
  coingeckoId?: string;
  quoteDenom: string;
  volume: number;
  hasCoinGeckoId: boolean;
}

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
    if (m.marketStatus !== "active") continue;

    const quoteDenom = m.quoteDenom;
    const scale = m.oracleScaleFactor ?? 0;
    const priceScale = Math.pow(10, Number(scale));
    
    const tokenMetadata = tokenMetadataMap.get(quoteDenom);
    const coingeckoId = tokenMetadata?.coingeckoId && tokenMetadata.coingeckoId.trim() !== "" 
      ? tokenMetadata.coingeckoId 
      : undefined;
    const tokenDecimals = tokenMetadata?.decimals ?? m.quoteTokenMeta?.decimals;

    map.set(m.marketId, {
      quoteDenom,
      priceScale,
      coingeckoId,
      tokenDecimals: Number(tokenDecimals),
    });
  }

  return map;
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
      `${INJECTIVE_TRADES_V2}` +
      `?marketId=${marketId}` +
      `&executionSide=taker` +
      `&startTime=${startMs}` +
      `&endTime=${endMs}` +
      `&limit=${limit}` +
      `&skip=${skip}`;
  
    const resp: TradesResponseV2 = await httpGet(url);
    const trades = resp.trades || [];
  
    if (!trades.length) break;
  
    for (const t of trades) {
      const rawPx = new BigNumber(t.positionDelta?.executionPrice ?? 0);
      const qty = new BigNumber(t.positionDelta?.executionQuantity ?? 0);
      const px = marketInfo.priceScale > 0 ? rawPx.div(marketInfo.priceScale) : rawPx;
  
      totalVolume = totalVolume.plus(px.times(qty));
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

  const tokenMetadataMap = await getTokenMetadataMap();
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
      "Sum of executionPrice (scaled by oracleScaleFactor) * executionQuantity over taker-side trades across all Injective perpetual derivative markets within the 24h window.",
  },
};

export default adapter;