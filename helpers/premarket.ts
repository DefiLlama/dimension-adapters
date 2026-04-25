import request, { gql } from "graphql-request";
import { FetchOptions } from "../adapters/types";

export const PREMARKET_GRAPHQL_ENDPOINT =
  "https://auth-prm.up.railway.app/premarket/api/graphql";

export const PREMARKET_START_DATE = "2026-04-15";

const PAGE_SIZE = 1000;
const VAULT_TOKEN_PRECISION = 10n ** 18n;
const ERC20_X_ERC6909_MARKET_TYPE = 1;

type Page<T> = {
  items: T[];
  totalCount: number;
};

export type OrderFill = {
  id: string;
  orderHash: string;
  maker: string;
  taker: string;
  makerAsset: string;
  takerAsset: string;
  makingAmount: string;
  takingAmount: string;
  tradeType: string;
  optionTokenId: string | null;
  marketId: string | null;
  transactionHash: string;
  blockNumber: string;
  timestamp: string;
};

export type OrderFee = {
  id: string;
  marketId: string;
  isTokenAsset: boolean;
  tokenId: string;
  amount: string;
  transactionHash: string;
  timestamp: string;
};

export type MintFee = {
  id: string;
  marketId: string;
  fees: string;
  timestamp: string;
};

export type RedeemFee = {
  id: string;
  prmTokenId: string;
  fees: string;
  timestamp: string;
};

export type RolloverFee = {
  id: string;
  marketId: string;
  rolloverFee: string;
  timestamp: string;
};

export type OptionMarket = {
  id: string;
  collateral: string;
  delivery: string;
  tickSize: string;
  tickSpacing: string;
  tokensPerTickSize: string;
  marketType: number;
  isCollateralScaled: boolean;
  isSpread: boolean;
  useAbsoluteSpreadCollateral: boolean;
  collateralToken?: { isStable: boolean } | null;
  deliveryToken?: { isStable: boolean } | null;
};

export type PrmInfo = {
  id: string;
  prmTokenId: string;
  oPrmTokenId: string;
  marketId: string;
  tick: string;
};

export type FillAmounts = {
  volumeToken: string;
  volumeAmount: bigint;
  notionalToken: string;
  notionalAmount: bigint;
};

const orderFillQuery = gql`
  query OrderFills($start: BigInt!, $end: BigInt!, $offset: Int!, $limit: Int!) {
    orderFillHistorys(
      where: { timestamp_gte: $start, timestamp_lt: $end }
      orderBy: "timestamp"
      orderDirection: "asc"
      offset: $offset
      limit: $limit
    ) {
      items {
        id
        orderHash
        maker
        taker
        makerAsset
        takerAsset
        makingAmount
        takingAmount
        tradeType
        optionTokenId
        marketId
        transactionHash
        blockNumber
        timestamp
      }
      totalCount
    }
  }
`;

const orderFeeQuery = gql`
  query OrderFees($start: BigInt!, $end: BigInt!, $offset: Int!, $limit: Int!) {
    orderFeeHistorys(
      where: { timestamp_gte: $start, timestamp_lt: $end }
      orderBy: "timestamp"
      orderDirection: "asc"
      offset: $offset
      limit: $limit
    ) {
      items {
        id
        marketId
        isTokenAsset
        tokenId
        amount
        transactionHash
        timestamp
      }
      totalCount
    }
  }
`;

const mintFeeQuery = gql`
  query MintFees($start: BigInt!, $end: BigInt!, $offset: Int!, $limit: Int!) {
    mintHistorys(
      where: { timestamp_gte: $start, timestamp_lt: $end }
      orderBy: "timestamp"
      orderDirection: "asc"
      offset: $offset
      limit: $limit
    ) {
      items {
        id
        marketId
        fees
        timestamp
      }
      totalCount
    }
  }
`;

const redeemFeeQuery = gql`
  query RedeemFees($start: BigInt!, $end: BigInt!, $offset: Int!, $limit: Int!) {
    redeemHistorys(
      where: { timestamp_gte: $start, timestamp_lt: $end }
      orderBy: "timestamp"
      orderDirection: "asc"
      offset: $offset
      limit: $limit
    ) {
      items {
        id
        prmTokenId
        fees
        timestamp
      }
      totalCount
    }
  }
`;

const rolloverFeeQuery = gql`
  query RolloverFees($start: BigInt!, $end: BigInt!, $offset: Int!, $limit: Int!) {
    rolloverHistorys(
      where: { timestamp_gte: $start, timestamp_lt: $end }
      orderBy: "timestamp"
      orderDirection: "asc"
      offset: $offset
      limit: $limit
    ) {
      items {
        id
        marketId
        rolloverFee
        timestamp
      }
      totalCount
    }
  }
`;

const marketsQuery = gql`
  query Markets($ids: [BigInt!], $offset: Int!, $limit: Int!) {
    optionMarkets(where: { id_in: $ids }, offset: $offset, limit: $limit) {
      items {
        id
        collateral
        delivery
        tickSize
        tickSpacing
        tokensPerTickSize
        marketType
        isCollateralScaled
        isSpread
        useAbsoluteSpreadCollateral
        collateralToken {
          isStable
        }
        deliveryToken {
          isStable
        }
      }
      totalCount
    }
  }
`;

const prmInfosQuery = gql`
  query PrmInfos($ids: [BigInt!], $offset: Int!, $limit: Int!) {
    prmInfos(where: { id_in: $ids }, offset: $offset, limit: $limit) {
      items {
        id
        prmTokenId
        oPrmTokenId
        marketId
        tick
      }
      totalCount
    }
  }
`;

async function fetchPaged<T>(
  pageName: string,
  query: string,
  variables: Record<string, string | number | string[]>,
) {
  const items: T[] = [];
  let offset = 0;
  let totalCount = Number.POSITIVE_INFINITY;

  while (offset < totalCount) {
    const response: Record<string, Page<T>> = await request(
      PREMARKET_GRAPHQL_ENDPOINT,
      query,
      { ...variables, offset, limit: PAGE_SIZE },
    );
    const page = response[pageName];

    if (!page) {
      throw new Error(`Premarket GraphQL response is missing ${pageName}`);
    }

    items.push(...page.items);
    totalCount = page.totalCount;
    offset += PAGE_SIZE;
  }

  return items;
}

async function fetchByIds<T>(
  pageName: string,
  query: string,
  ids: Iterable<string>,
) {
  const uniqueIds = [...new Set([...ids].filter(Boolean))];
  const items: T[] = [];

  for (let i = 0; i < uniqueIds.length; i += PAGE_SIZE) {
    const idChunk = uniqueIds.slice(i, i + PAGE_SIZE);
    items.push(
      ...(await fetchPaged<T>(pageName, query, {
        ids: idChunk,
      })),
    );
  }

  return items;
}

function fetchTimeWindow<T>(
  pageName: string,
  query: string,
  options: FetchOptions,
) {
  return fetchPaged<T>(pageName, query, {
    start: String(options.startTimestamp),
    end: String(options.endTimestamp),
  });
}

export function fetchOrderFills(options: FetchOptions) {
  return fetchTimeWindow<OrderFill>(
    "orderFillHistorys",
    orderFillQuery,
    options,
  );
}

export function fetchOrderFees(options: FetchOptions) {
  return fetchTimeWindow<OrderFee>("orderFeeHistorys", orderFeeQuery, options);
}

export function fetchMintFees(options: FetchOptions) {
  return fetchTimeWindow<MintFee>("mintHistorys", mintFeeQuery, options);
}

export function fetchRedeemFees(options: FetchOptions) {
  return fetchTimeWindow<RedeemFee>("redeemHistorys", redeemFeeQuery, options);
}

export function fetchRolloverFees(options: FetchOptions) {
  return fetchTimeWindow<RolloverFee>(
    "rolloverHistorys",
    rolloverFeeQuery,
    options,
  );
}

export async function fetchMarketsById(ids: Iterable<string>) {
  const markets = await fetchByIds<OptionMarket>(
    "optionMarkets",
    marketsQuery,
    ids,
  );
  return new Map(markets.map((market) => [market.id, market]));
}

export async function fetchPrmInfosById(ids: Iterable<string>) {
  const prmInfos = await fetchByIds<PrmInfo>("prmInfos", prmInfosQuery, ids);
  return new Map(prmInfos.map((prmInfo) => [prmInfo.id, prmInfo]));
}

export function normalizeAddress(address: string) {
  return address.toLowerCase();
}

export function prmTokenIdFromAnyTokenId(tokenId: string | null | undefined) {
  if (!tokenId) return undefined;
  return (BigInt(tokenId) & ~1n).toString();
}

type TradeType = "buy" | "sell";
type PendingFill = {
  fill: OrderFill;
  amount: FillAmounts;
};

function parseTradeType(tradeType: string): TradeType | undefined {
  if (tradeType === "buy" || tradeType === "sell") return tradeType;
  return undefined;
}

function getCollateralTickCount(market: OptionMarket) {
  if (!market.isSpread) return 1n;

  const tickSize = BigInt(market.tickSize);
  const tickSpacing = BigInt(market.tickSpacing);
  const strikeCount = tickSpacing > tickSize ? tickSpacing / tickSize : 1n;

  return market.useAbsoluteSpreadCollateral ? strikeCount + 1n : strikeCount;
}

function getCollateralPerUnit(market: OptionMarket, prmInfo: PrmInfo) {
  let collateralPerUnit =
    getCollateralTickCount(market) * BigInt(market.tokensPerTickSize);

  if (market.isCollateralScaled) {
    collateralPerUnit =
      (BigInt(prmInfo.tick) * collateralPerUnit) / BigInt(market.tickSize);
  }

  return collateralPerUnit;
}

export function getCollateralNotional(
  market: OptionMarket,
  prmInfo: PrmInfo,
  optionAmount: bigint,
) {
  return (
    (getCollateralPerUnit(market, prmInfo) * optionAmount) /
    VAULT_TOKEN_PRECISION
  );
}

export function getFillAmounts(
  fill: OrderFill,
  market: OptionMarket | undefined,
  prmInfo: PrmInfo | undefined,
): FillAmounts | undefined {
  if (!market) return undefined;

  const tradeType = parseTradeType(fill.tradeType);
  if (!tradeType) return undefined;

  const makerAsset = normalizeAddress(fill.makerAsset);
  const takerAsset = normalizeAddress(fill.takerAsset);
  const collateral = normalizeAddress(market.collateral);
  const cashAmount =
    tradeType === "buy" ? BigInt(fill.makingAmount) : BigInt(fill.takingAmount);
  const exposureAmount =
    tradeType === "buy" ? BigInt(fill.takingAmount) : BigInt(fill.makingAmount);

  const collateralOnExpectedSide =
    tradeType === "buy"
      ? makerAsset === collateral && takerAsset !== collateral
      : takerAsset === collateral && makerAsset !== collateral;

  if (!collateralOnExpectedSide) return undefined;

  if (market.marketType === ERC20_X_ERC6909_MARKET_TYPE) {
    if (!prmInfo) return undefined;

    return {
      volumeToken: collateral,
      volumeAmount: cashAmount,
      notionalToken: collateral,
      notionalAmount: getCollateralNotional(market, prmInfo, exposureAmount),
    };
  }

  const exposureToken =
    tradeType === "buy"
      ? normalizeAddress(fill.takerAsset)
      : normalizeAddress(fill.makerAsset);
  if (exposureToken === collateral) return undefined;
  return {
    volumeToken: collateral,
    volumeAmount: cashAmount,
    notionalToken: exposureToken,
    notionalAmount: exposureAmount,
  };
}

function combineFillAmounts(left: FillAmounts, right: FillAmounts) {
  return {
    volumeToken: left.volumeToken,
    volumeAmount:
      right.volumeAmount > left.volumeAmount
        ? right.volumeAmount
        : left.volumeAmount,
    notionalToken: left.notionalToken,
    notionalAmount:
      right.notionalAmount > left.notionalAmount
        ? right.notionalAmount
        : left.notionalAmount,
  };
}

function buildFillPairKey(fill: OrderFill, reversed = false) {
  return [
    fill.transactionHash,
    fill.marketId ?? "",
    fill.optionTokenId ?? "",
    normalizeAddress(reversed ? fill.taker : fill.maker),
    normalizeAddress(reversed ? fill.maker : fill.taker),
    normalizeAddress(reversed ? fill.takerAsset : fill.makerAsset),
    normalizeAddress(reversed ? fill.makerAsset : fill.takerAsset),
    reversed ? fill.takingAmount : fill.makingAmount,
    reversed ? fill.makingAmount : fill.takingAmount,
  ].join("|");
}

function takePendingFill(
  pendingByKey: Map<string, PendingFill[]>,
  key: string,
  fill: OrderFill,
) {
  const pending = pendingByKey.get(key);
  if (!pending?.length) return undefined;

  const index = pending.findIndex(
    (candidate) =>
      candidate.fill.id !== fill.id &&
      candidate.fill.orderHash !== fill.orderHash,
  );
  if (index === -1) return undefined;

  const [candidate] = pending.splice(index, 1);
  if (!pending.length) {
    pendingByKey.delete(key);
  }

  return candidate;
}

export function getDedupedFillAmounts(
  fills: OrderFill[],
  marketsById: Map<string, OptionMarket>,
  prmInfosById: Map<string, PrmInfo>,
) {
  const pendingByKey = new Map<string, PendingFill[]>();
  const amounts: FillAmounts[] = [];

  for (const fill of fills) {
    const marketId = fill.marketId ?? "";
    const market = marketsById.get(marketId);
    const prmInfo = prmInfosById.get(
      prmTokenIdFromAnyTokenId(fill.optionTokenId) ?? "",
    );
    const fillAmounts = getFillAmounts(fill, market, prmInfo);

    if (!fillAmounts) {
      continue;
    }

    const reverseKey = buildFillPairKey(fill, true);
    const pair = takePendingFill(pendingByKey, reverseKey, fill);

    if (!pair) {
      const forwardKey = buildFillPairKey(fill);
      const pending = pendingByKey.get(forwardKey) ?? [];
      pending.push({ fill, amount: fillAmounts });
      pendingByKey.set(forwardKey, pending);
      continue;
    }

    if (
      pair.amount.volumeToken === fillAmounts.volumeToken &&
      pair.amount.notionalToken === fillAmounts.notionalToken
    ) {
      amounts.push(combineFillAmounts(pair.amount, fillAmounts));
      continue;
    }

    amounts.push(pair.amount, fillAmounts);
  }

  for (const pending of pendingByKey.values()) {
    for (const { amount } of pending) {
      amounts.push(amount);
    }
  }

  return amounts;
}

export function getRedeemFeeToken(market: OptionMarket | undefined) {
  if (!market) return undefined;

  if (market.deliveryToken?.isStable) return normalizeAddress(market.delivery);
  if (market.collateralToken?.isStable) {
    return normalizeAddress(market.collateral);
  }

  return normalizeAddress(market.delivery);
}
