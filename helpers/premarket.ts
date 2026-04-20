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

function isSameAddress(left: string, right: string) {
  return normalizeAddress(left) === normalizeAddress(right);
}

export function prmTokenIdFromAnyTokenId(tokenId: string | null | undefined) {
  if (!tokenId) return undefined;
  return (BigInt(tokenId) & ~1n).toString();
}

function getCollateralPerUnit(market: OptionMarket, prmInfo: PrmInfo) {
  const tickSize = BigInt(market.tickSize);
  const tickSpacing = BigInt(market.tickSpacing);
  const tokensPerTickSize = BigInt(market.tokensPerTickSize);
  const strikeCount = tickSpacing > tickSize ? tickSpacing / tickSize : 1n;
  let collateralPerUnit = strikeCount * tokensPerTickSize;

  if (market.isCollateralScaled) {
    collateralPerUnit = (BigInt(prmInfo.tick) * collateralPerUnit) / tickSize;
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

  const makerAsset = normalizeAddress(fill.makerAsset);
  const takerAsset = normalizeAddress(fill.takerAsset);
  const collateral = normalizeAddress(market.collateral);
  const makingAmount = BigInt(fill.makingAmount);
  const takingAmount = BigInt(fill.takingAmount);

  if (market.marketType === ERC20_X_ERC6909_MARKET_TYPE) {
    if (!prmInfo) return undefined;

    if (makerAsset === collateral) {
      return {
        volumeToken: collateral,
        volumeAmount: makingAmount,
        notionalToken: collateral,
        notionalAmount: getCollateralNotional(market, prmInfo, takingAmount),
      };
    }

    if (takerAsset === collateral) {
      return {
        volumeToken: collateral,
        volumeAmount: takingAmount,
        notionalToken: collateral,
        notionalAmount: getCollateralNotional(market, prmInfo, makingAmount),
      };
    }

    return undefined;
  }

  if (makerAsset === collateral) {
    return {
      volumeToken: collateral,
      volumeAmount: makingAmount,
      notionalToken: takerAsset,
      notionalAmount: takingAmount,
    };
  }

  if (takerAsset === collateral) {
    return {
      volumeToken: collateral,
      volumeAmount: takingAmount,
      notionalToken: makerAsset,
      notionalAmount: makingAmount,
    };
  }

  return {
    volumeToken: takerAsset,
    volumeAmount: takingAmount,
    notionalToken: makerAsset,
    notionalAmount: makingAmount,
  };
}

function combineFillAmounts(left: FillAmounts, right: FillAmounts) {
  if (
    left.volumeToken !== right.volumeToken ||
    left.notionalToken !== right.notionalToken
  ) {
    return left;
  }

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

function isMatchedFillPair(left: OrderFill, right: OrderFill) {
  return (
    right.transactionHash === left.transactionHash &&
    right.marketId === left.marketId &&
    right.optionTokenId === left.optionTokenId &&
    right.orderHash !== left.orderHash &&
    isSameAddress(right.maker, left.taker) &&
    isSameAddress(right.taker, left.maker) &&
    isSameAddress(right.makerAsset, left.takerAsset) &&
    isSameAddress(right.takerAsset, left.makerAsset)
  );
}

export function getDedupedFillAmounts(
  fills: OrderFill[],
  marketsById: Map<string, OptionMarket>,
  prmInfosById: Map<string, PrmInfo>,
) {
  const consumed = new Set<number>();
  const amounts: FillAmounts[] = [];

  for (let i = 0; i < fills.length; i++) {
    if (consumed.has(i)) continue;

    const fill = fills[i];
    const marketId = fill.marketId ?? "";
    const market = marketsById.get(marketId);
    const prmInfo = prmInfosById.get(
      prmTokenIdFromAnyTokenId(fill.optionTokenId) ?? "",
    );
    const fillAmounts = getFillAmounts(fill, market, prmInfo);

    if (!fillAmounts) {
      consumed.add(i);
      continue;
    }

    const pairIndex = fills.findIndex((candidate, candidateIndex) => {
      if (candidateIndex <= i || consumed.has(candidateIndex)) return false;
      return isMatchedFillPair(fill, candidate);
    });

    if (pairIndex === -1) {
      amounts.push(fillAmounts);
      consumed.add(i);
      continue;
    }

    const pair = fills[pairIndex];
    const pairMarket = marketsById.get(pair.marketId ?? "");
    const pairPrmInfo = prmInfosById.get(
      prmTokenIdFromAnyTokenId(pair.optionTokenId) ?? "",
    );
    const pairAmounts = getFillAmounts(pair, pairMarket, pairPrmInfo);

    amounts.push(
      pairAmounts ? combineFillAmounts(fillAmounts, pairAmounts) : fillAmounts,
    );
    consumed.add(i);
    consumed.add(pairIndex);
  }

  return amounts;
}

export function getRedeemFeeToken(market: OptionMarket | undefined) {
  if (!market) return undefined;

  if (market.deliveryToken?.isStable) return normalizeAddress(market.delivery);
  if (market.collateralToken?.isStable) return normalizeAddress(market.collateral);

  return normalizeAddress(market.delivery);
}
