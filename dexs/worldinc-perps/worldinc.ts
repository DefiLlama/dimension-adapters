import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import CoreAssets from "../../helpers/coreAssets.json";

// Composite Exchange contract address
const COMPOSITE_EXCHANGE = "0x5e3Ae52EbA0F9740364Bd5dd39738e1336086A8b";

// Event signatures for perp orderbook registration and trades
const SPOT_PERP_TRADE_EVENT = "event NewTrade(uint64 indexed buyer, uint64 indexed seller, uint256 spotMatchQuantities, uint256 spotMatchData)";
const ABI_GET_PERPS = 'function getPerpOrderBook(uint32 token1, uint32 token2) external view returns (address, uint32 buyToken, uint32 payToken)';
const ABI_GET_SPOT = 'function getSpotOrderBook(uint32 token1, uint32 token2) external view returns (address, uint32 buyToken, uint32 payToken)';
const ABI_GET_TOKEN_CONFIGS = 'function readTokenConfig(uint32 tokenId) external view returns (uint256)';

interface OrderbookMarket {
  type: 'PERPS' | 'SPOT';
  baseTokenId: number;
  quoteTokenId: number;
}

interface Orderbooks {
  // market address => market config
  markets: Record<string, OrderbookMarket>;
  
  // token id => token decimals
  tokenDecimals: Record<number, number>;
}

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

// Helper function to parse price (BigInt arithmetic to avoid precision loss; mantissa can be up to 59 bits)
function parsePrice59EN5(p: bigint): number {
  const PRICE_EXP_MASK = BigInt("0x1F");
  const exponent = Number(p & PRICE_EXP_MASK);
  const mantissa = p >> 5n;
  const denom = 10n ** BigInt(exponent);
  const intPart = mantissa / denom;
  const rem = mantissa % denom;
  const frac = Number(rem) / Math.pow(10, exponent);
  return Number(intPart) + frac;
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

// Helper function to parse volume from perp trade event
function parseVolumeValue(spotMatchQuantities: any, spotMatchData: any, orderbooks: Orderbooks, marketAddress: string): number {
  const orderbookConfig = orderbooks.markets[marketAddress];

  if (!orderbookConfig || !spotMatchQuantities || !spotMatchData) {
    return 0;
  }

  const qtyData = parseSpotMatchQuantities(BigInt(spotMatchQuantities));
  const metaData = parseSpotMatchData(BigInt(spotMatchData));
  const price = parsePrice59EN5(metaData.priceRaw);

  const quoteDecimals = orderbookConfig.quoteTokenId ? (orderbooks.tokenDecimals[orderbookConfig.quoteTokenId] || 8) : 8;
  const baseDecimals = orderbookConfig.baseTokenId ? (orderbooks.tokenDecimals[orderbookConfig.baseTokenId] || 8) : 8;
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

// Discover perp orderbooks via contract view getPerpOrderBook(token1, token2)
async function getOrderbooks(options: FetchOptions, type: 'PERPS' | 'SPOT'): Promise<Orderbooks> {
  const orderbooks: Orderbooks = {
    markets: {},
    tokenDecimals: {},
  };
  
  const highestTokenId = await options.api.call({abi: "function getHighestTokenId() external view returns (uint32)", target: COMPOSITE_EXCHANGE });
  const maxId = Number(highestTokenId);

  const calls: Array<{ target: string; params: [number, number] }> = [];
  for (let token1 = 1; token1 <= maxId; token1++) {
    for (let token2 = 1; token2 <= maxId; token2++) {
      if (token1 === token2) continue;
      calls.push({ target: COMPOSITE_EXCHANGE, params: [token1, token2] });
    }
  }
  
  const tokenIds = new Set<number>();
  const abi = type === 'PERPS' ? ABI_GET_PERPS : ABI_GET_SPOT;
  const callResults = await options.api.multiCall({
    abi: abi,
    calls: calls,
    permitFailure: true,
  });

  callResults.forEach((result: any, index: number) => {
    if (!result || result[0] == null) return;
    const addr = String(result[0]).toLowerCase();
    if (addr === CoreAssets.null || addr === "0x") return;
    const buyToken = Number(result[1]);
    const payToken = Number(result[2]);
    orderbooks.markets[addr] = {
      type: type,
      baseTokenId: buyToken,
      quoteTokenId: payToken,
    }
    tokenIds.add(buyToken);
    tokenIds.add(payToken);
  });

  const tokenConfigCalls = Array.from(tokenIds).map((tokenId) => ({
    target: COMPOSITE_EXCHANGE,
    params: [tokenId],
  }));

  const tokenConfigs = await options.api.multiCall({
    abi: ABI_GET_TOKEN_CONFIGS,
    calls: tokenConfigCalls,
    permitFailure: true,
  });

  Array.from(tokenIds).forEach((tokenId, index) => {
    if (tokenConfigs[index] && tokenConfigs[index] !== 0n) {
      const config = decodeVaultTokenConfig(BigInt(tokenConfigs[index]));
      orderbooks.tokenDecimals[tokenId] = config.positionDecimals;
    } else {
      orderbooks.tokenDecimals[tokenId] = 8;
    }
  });
  
  return orderbooks;
}

function getFetch(type: 'PERPS' | 'SPOT') {
  return async (options: FetchOptions): Promise<FetchResultVolume> => {
    const orderbooks = await getOrderbooks(options, type);
  
    if (Object.keys(orderbooks.markets).length === 0) {
      return { dailyVolume: 0 };
    }
    
    const marketAddresses = Object.keys(orderbooks.markets);
    const marketLogs = await options.getLogs({
      targets: marketAddresses,
      eventAbi: SPOT_PERP_TRADE_EVENT,
      flatten: false,
    });
    
    let dailyVolume = 0;
    for (let i = 0; i < marketAddresses.length; i++) {
      for (const log of marketLogs[i]) {
        dailyVolume += parseVolumeValue(log[2], log[3], orderbooks, marketAddresses[i]);
      }
    }
    
    return { dailyVolume };
  }
}

export const perpsAdapter: SimpleAdapter = {
  version: 2,
  fetch: getFetch('PERPS'),
  chains: [CHAIN.MEGAETH],
  start: "2026-02-09",
};

export const spotAdapter: SimpleAdapter = {
  version: 2,
  fetch: getFetch('SPOT'),
  chains: [CHAIN.MEGAETH],
  start: "2026-02-09",
};
