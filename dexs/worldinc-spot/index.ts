import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Composite Exchange contract address
const COMPOSITE_EXCHANGE = "0x5e3Ae52EbA0F9740364Bd5dd39738e1336086A8b";

// Starting block for orderbook discovery
const EXCHANGE_START_BLOCK = 7274995;

// Event signatures for spot orderbook registration and trades
const SPOT_ORDERBOOK_REGISTERED = "event OrderBookRegistered(address orderBook, uint32 buyTokenId, uint32 payTokenId)";
const SPOT_PERP_TRADE_EVENT = "event NewTrade(uint64 indexed buyer, uint64 indexed seller, uint256 spotMatchQuantities, uint256 spotMatchData)";

// Helper function to parse spot match quantities
function parseSpotMatchQuantities(smq: bigint) {
  const MASK_64 = BigInt("0xFFFFFFFFFFFFFFFF");
  const fromFee = smq & MASK_64;
  const toFee = (smq >> 64n) & MASK_64;
  const fromQuantity = (smq >> 128n) & MASK_64;
  const toQuantity = (smq >> 192n) & MASK_64;
  return { fromFee, toFee, fromQuantity, toQuantity };
}

// Helper function to parse spot match data
function parseSpotMatchData(smd: bigint) {
  const MASK_32 = BigInt("0xFFFFFFFF");
  const MASK_64 = BigInt("0xFFFFFFFFFFFFFFFF");
  const MASK_1 = BigInt("1");
  const tradeSeq = smd & MASK_32;
  const sellerOrderId = (smd >> 32n) & MASK_64;
  const buyerOrderId = (smd >> 96n) & MASK_64;
  const priceRaw = (smd >> 160n) & MASK_64;
  const buyerIsMaker = ((smd >> 224n) & MASK_1) !== 0n;
  return { tradeSeq, sellerOrderId, buyerOrderId, priceRaw, buyerIsMaker };
}

// Helper function to parse price
function parsePrice59EN5(p: bigint): number {
  const PRICE_EXP_MASK = BigInt("0x1F");
  const exponent = Number(p & PRICE_EXP_MASK);
  const mantissa = p >> 5n;
  return Number(mantissa) * Math.pow(10, -exponent);
}

// Helper function to parse volume from spot trade event
function parseSpotPerpVolume(
  event: any,
  orderbookConfig: { baseId?: number; quoteId?: number; type: string },
  tokenDecimals: Record<number, number>
): number {
  const { spotMatchQuantities, spotMatchData } = event;

  if (!spotMatchQuantities || !spotMatchData) {
    return 0;
  }

  const qtyData = parseSpotMatchQuantities(BigInt(spotMatchQuantities));
  const metaData = parseSpotMatchData(BigInt(spotMatchData));
  const price = parsePrice59EN5(metaData.priceRaw);

  const quoteDecimals = orderbookConfig.quoteId ? (tokenDecimals[orderbookConfig.quoteId] || 8) : 8;
  const baseDecimals = orderbookConfig.baseId ? (tokenDecimals[orderbookConfig.baseId] || 8) : 8;

  let volume = 0;

  if (qtyData.toQuantity > 0n) {
    volume = Number(qtyData.toQuantity) / Math.pow(10, quoteDecimals);
  } else if (qtyData.fromQuantity > 0n) {
    const baseAmount = Number(qtyData.fromQuantity) / Math.pow(10, baseDecimals);
    volume = baseAmount * price;
  }

  return volume;
}

// Helper function to decode token config
function decodeVaultTokenConfig(vtc: bigint) {
  const vtcBigInt = BigInt(vtc);
  const addressMask = (1n << 160n) - 1n;
  const tokenAddressRaw = vtcBigInt & addressMask;
  const tokenAddress = "0x" + tokenAddressRaw.toString(16).padStart(40, "0");

  const sequestrationMultiplier = Number((vtcBigInt >> 160n) & 0xffn);
  const positionDecimals = Number((vtcBigInt >> 168n) & 0xffn);
  const vaultDecimals = Number((vtcBigInt >> 176n) & 0xffn);
  const erc20Decimals = Number((vtcBigInt >> 184n) & 0xffn);
  const tokenType = Number((vtcBigInt >> 192n) & 0xffn);
  const tokenId = Number((vtcBigInt >> 200n) & 0xffffffffn);

  return {
    tokenAddress,
    sequestrationMultiplier,
    positionDecimals,
    vaultDecimals,
    erc20Decimals,
    tokenType,
    tokenId,
  };
}

// Discover spot orderbooks only
async function getSpotOrderbooks(
  getLogs: any,
  api: any,
  exchangeAddress: string,
  fromBlock: number
): Promise<{
  orderbooks: string[];
  tokenDecimals: Record<number, number>;
  orderbookConfigs: Record<string, { baseId?: number; quoteId?: number; type: string }>;
}> {
  const spotLogs = await getLogs({
    target: exchangeAddress,
    eventAbi: SPOT_ORDERBOOK_REGISTERED,
    fromBlock: fromBlock,
    cacheInCloud: false,
    skipIndexer: true,
  });

  const orderbooks = new Set<string>();
  const orderbookConfigs: Record<string, { baseId?: number; quoteId?: number; type: string }> = {};
  const tokenIds = new Set<number>();

  spotLogs.forEach((log: any) => {
    const orderbookAddr = String(log.orderBook || log.orderbook || log.args?.orderBook).toLowerCase();
    const buyTokenId = Number(log.buyTokenId || log.args?.buyTokenId);
    const payTokenId = Number(log.payTokenId || log.args?.payTokenId);
    if (orderbookAddr && buyTokenId && payTokenId) {
      orderbooks.add(orderbookAddr);
      orderbookConfigs[orderbookAddr] = { baseId: buyTokenId, quoteId: payTokenId, type: "SPOT" };
      tokenIds.add(buyTokenId);
      tokenIds.add(payTokenId);
    }
  });

  const finalOrderbooks = Array.from(orderbooks);
  const tokenDecimals: Record<number, number> = {};

  const tokenConfigCalls = Array.from(tokenIds).map((tokenId) => ({
    target: exchangeAddress,
    params: [tokenId],
  }));

  const tokenConfigs = await api.multiCall({
    abi: "function readTokenConfig(uint32 tokenId) external view returns (uint256)",
    calls: tokenConfigCalls,
    permitFailure: true,
  });

  Array.from(tokenIds).forEach((tokenId, index) => {
    if (tokenConfigs[index] && tokenConfigs[index] !== 0n) {
      const config = decodeVaultTokenConfig(BigInt(tokenConfigs[index]));
      tokenDecimals[tokenId] = config.positionDecimals;
    } else {
      tokenDecimals[tokenId] = 8;
    }
  });

  return { orderbooks: finalOrderbooks, tokenDecimals, orderbookConfigs };
}

const fetch = async ({ getLogs, api }: FetchOptions): Promise<FetchResultVolume> => {
  let orderbookData: {
    orderbooks: string[];
    tokenDecimals: Record<number, number>;
    orderbookConfigs: Record<string, any>;
  } | null = null;

  try {
    orderbookData = await getSpotOrderbooks(getLogs, api, COMPOSITE_EXCHANGE, EXCHANGE_START_BLOCK);
  } catch (e) {
    return { dailyVolume: 0 };
  }

  const { orderbooks: orderbookAddresses, tokenDecimals, orderbookConfigs } = orderbookData;

  if (orderbookAddresses.length === 0) {
    return { dailyVolume: 0 };
  }

  const spotLogs = await getLogs({
    targets: orderbookAddresses,
    eventAbi: SPOT_PERP_TRADE_EVENT,
    entireLog: true,
    fromBlock: EXCHANGE_START_BLOCK,
    cacheInCloud: false,
    skipIndexer: true,
  });

  const volumes = spotLogs.map((log: any) => {
    const eventData = log.args || log.parsedLog?.args || log;
    if (!eventData.spotMatchQuantities && !eventData.spotMatchData) {
      return 0;
    }

    const orderbookAddr = (log.address || log.srcAddress || log.target)?.toLowerCase();
    const orderbookConfig = orderbookConfigs[orderbookAddr] || { type: "UNKNOWN" };

    return parseSpotPerpVolume(eventData, orderbookConfig, tokenDecimals);
  });

  const dailyVolume = volumes.reduce((sum, volume) => sum + volume, 0);

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.MEGAETH],
  start: "2026-02-09",
};

export default adapter;
