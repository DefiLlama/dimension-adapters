import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Composite Exchange contract address
const COMPOSITE_EXCHANGE = "0x5e3Ae52EbA0F9740364Bd5dd39738e1336086A8b";

// Starting block for orderbook discovery (used only for fallback event-based discovery)
const EXCHANGE_START_BLOCK = 7274994;

// Event signatures for perp orderbook registration and trades
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

// Helper function to parse volume from perp trade event
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
  const quoteFactor = 10n ** BigInt(quoteDecimals);
  const baseFactor = 10n ** BigInt(baseDecimals);

  let volume = 0;

  if (qtyData.toQuantity > 0n) {
    volume = Number(qtyData.toQuantity / quoteFactor) + Number(qtyData.toQuantity % quoteFactor) / Number(quoteFactor);
  } else if (qtyData.fromQuantity > 0n) {
    const baseAmount = Number(qtyData.fromQuantity / baseFactor) + Number(qtyData.fromQuantity % baseFactor) / Number(baseFactor);
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

// Discover perp orderbooks via contract view getPerpOrderBook(token1, token2) (same as example/points-indexer/fetch_metadata.js)
async function getPerpOrderbooks(
  _getLogs: any,
  api: any,
  exchangeAddress: string,
  _fromBlock: number
): Promise<{
  orderbooks: string[];
  tokenDecimals: Record<number, number>;
  orderbookConfigs: Record<string, { baseId?: number; quoteId?: number; type: string }>;
}> {
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const highestTokenId = await api.call({
    abi: "function getHighestTokenId() external view returns (uint32)",
    target: exchangeAddress,
  });
  const maxId = Number(highestTokenId);

  const perpCalls: Array<{ target: string; params: [number, number] }> = [];
  for (let token1 = 1; token1 <= maxId; token1++) {
    for (let token2 = 1; token2 <= maxId; token2++) {
      if (token1 === token2) continue;
      perpCalls.push({ target: exchangeAddress, params: [token1, token2] });
    }
  }

  const perpResults = await api.multiCall({
    abi: "function getPerpOrderBook(uint32 token1, uint32 token2) external view returns (address, uint32 buyToken, uint32 payToken)",
    calls: perpCalls,
    permitFailure: true,
  });

  const orderbooks = new Set<string>();
  const orderbookConfigs: Record<string, { baseId?: number; quoteId?: number; type: string }> = {};
  const tokenIds = new Set<number>();

  perpResults.forEach((result: any, index: number) => {
    if (!result || result[0] == null) return;
    const addr = String(result[0]).toLowerCase();
    if (addr === ZERO_ADDRESS || addr === "0x") return;
    const buyToken = Number(result[1]);
    const payToken = Number(result[2]);
    orderbooks.add(addr);
    orderbookConfigs[addr] = { baseId: buyToken, quoteId: payToken, type: "PERP" };
    tokenIds.add(buyToken);
    tokenIds.add(payToken);
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

const fetch = async ({ getLogs, api, getFromBlock, getToBlock }: FetchOptions): Promise<FetchResultVolume> => {
  let orderbookData: {
    orderbooks: string[];
    tokenDecimals: Record<number, number>;
    orderbookConfigs: Record<string, any>;
  } | null = null;

  try {
    orderbookData = await getPerpOrderbooks(getLogs, api, COMPOSITE_EXCHANGE, EXCHANGE_START_BLOCK);
  } catch (e) {
    return { dailyVolume: 0 };
  }

  const { orderbooks: orderbookAddresses, tokenDecimals, orderbookConfigs } = orderbookData;

  if (orderbookAddresses.length === 0) {
    return { dailyVolume: 0 };
  }

  const fromBlock = await getFromBlock();
  const toBlock = await getToBlock();
  if (fromBlock == null || toBlock == null) {
    return { dailyVolume: 0 };
  }

  try {
    const perpLogs = await getLogs({
      targets: orderbookAddresses,
      eventAbi: SPOT_PERP_TRADE_EVENT,
      entireLog: true,
      fromBlock,
      toBlock,
      cacheInCloud: false,
      skipIndexer: true,
    });

    const volumes = perpLogs.map((log: any) => {
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
  } catch (e) {
    return { dailyVolume: 0 };
  }
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.MEGAETH],
  start: "2026-02-09",
};

export default adapter;
