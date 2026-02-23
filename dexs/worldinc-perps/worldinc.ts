import { FetchOptions, FetchResult, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import CoreAssets from "../../helpers/coreAssets.json";

// Composite Exchange contract address
const COMPOSITE_EXCHANGE = "0x5e3Ae52EbA0F9740364Bd5dd39738e1336086A8b";

// Event signatures for perp orderbook registration and trades
const SPOT_PERP_TRADE_EVENT = "event NewTrade(uint64 indexed buyer, uint64 indexed seller, uint256 spotMatchQuantities, uint256 spotMatchData)";
const INTEREST_PAID_EVENT = "event InterestPaid(uint64 indexed positionId, uint256 interestAndFees)";
// LendPositionClosed/Changed carry LendMatch or LendingEventData so we can get tokenId (readLendingPosition returns 0 for closed positions)
const LEND_POSITION_CLOSED_EVENT = "event LendPositionClosed(uint64 indexed positionId, uint256 lendMatch)";
const LEND_POSITION_CHANGED_EVENT = "event LendPositionChanged(uint64 indexed positionId, uint256 lendMatch)";
// LiquidationPayoff: bits 0–127 = quantity (uint128), 128–171 = liquidatorId, 172–215 = originalOwnerId (PublicStruct.sol)
const LIQUIDATION_EVENT = "event Liquidation(uint64 indexed userId, uint256 liquidatoinPayoff)";

const ABI_GET_PERPS = 'function getPerpOrderBook(uint32 token1, uint32 token2) external view returns (address, uint32 buyToken, uint32 payToken)';
const ABI_GET_SPOT = 'function getSpotOrderBook(uint32 token1, uint32 token2) external view returns (address, uint32 buyToken, uint32 payToken)';
const ABI_GET_LEND = 'function getLendOrderBook(uint32 tokenId) external view returns (address)';
const ABI_GET_TOKEN_CONFIGS = 'function readTokenConfig(uint32 tokenId) external view returns (uint256)';
const ABI_GET_LEND_POSITION = 'function readLendingPosition(uint64 positionId) external view returns (uint256)';

const METRICS = {
  PerpsFees: 'Perps Trading Fees',
  SpotFees: 'Spot Trading Fees',
  LendingInterest: 'Lending Interest',
  LiquidationFees: 'Liquidation Fees',
}

interface OrderbookMarket {
  type: 'PERPS' | 'SPOT';
  baseTokenId: number;
  quoteTokenId: number;
}

interface Orderbooks {
  // market address => market config
  markets: Record<string, OrderbookMarket>;
  
  // lend orderbook
  lendMarkets: Array<string>;
  
  // token id => token decimals
  tokenDecimals: Record<number, number>;
  tokenErc20Decimals: Record<number, number>;
  tokenVaultDecimals: Record<number, number>;
  
  // token id => token address
  tokenAddresses: Record<number, string>;
}

const MASK_64 = BigInt("0xFFFFFFFFFFFFFFFF");
const MASK_32 = BigInt("0xFFFFFFFF");
const MASK_128 = (1n << 128n) - 1n;
const USDM_TOKEN_ID = 1;

function parseMatchQuantities(smq: bigint) {
  const fromFee = smq & MASK_64;
  const toFee = (smq >> 64n) & MASK_64;
  const fromQuantity = (smq >> 128n) & MASK_64;
  const toQuantity = (smq >> 192n) & MASK_64;
  return { fromFee, toFee, fromQuantity, toQuantity };
}

function positionRawToErc20Raw(raw: bigint, positionDecimals: number, erc20Decimals: number): bigint {
  if (positionDecimals === erc20Decimals) return raw;
  if (erc20Decimals >= positionDecimals)
    return raw * 10n ** BigInt(erc20Decimals - positionDecimals);
  return raw / 10n ** BigInt(positionDecimals - erc20Decimals);
}

function parseInterestPaidData(interestAndFees: bigint) {
  const interest = interestAndFees & MASK_128;
  const fees = interestAndFees >> 128n;
  return { interest, fees };
}

function parseLiquidationPayoffQuantity(liquidatoinPayoff: bigint): bigint {
  return liquidatoinPayoff & MASK_128;
}

function tokenIdFromLendMatch(lendMatchRaw: bigint): number {
  return Number((lendMatchRaw >> 80n) & MASK_32);
}

function tokenIdFromLendingEventData(lendingEventDataRaw: bigint): number {
  return Number((lendingEventDataRaw >> 96n) & MASK_32);
}

function vaultRawToErc20Raw(raw: bigint, vaultDecimals: number, erc20Decimals: number): bigint {
  if (vaultDecimals === erc20Decimals) return raw;
  if (erc20Decimals >= vaultDecimals) return raw * 10n ** BigInt(erc20Decimals - vaultDecimals);
  return raw / 10n ** BigInt(vaultDecimals - erc20Decimals);
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

// Discover perp orderbooks via contract view getPerpOrderBook(token1, token2)
async function getOrderbooks(options: FetchOptions, type: 'PERPS' | 'SPOT'): Promise<Orderbooks> {
  const orderbooks: Orderbooks = {
    markets: {},
    lendMarkets: [],
    tokenDecimals: {},
    tokenErc20Decimals: {},
    tokenVaultDecimals: {},
    tokenAddresses: {},
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
  
  for (const result of callResults) {
    if (!result || result[0] == null) continue;
    const addr = String(result[0]).toLowerCase();
    if (addr === CoreAssets.null || addr === "0x") continue;
    const buyToken = Number(result[1]);
    const payToken = Number(result[2]);
    orderbooks.markets[addr] = {
      type: type,
      baseTokenId: buyToken,
      quoteTokenId: payToken,
    }
    tokenIds.add(buyToken);
    tokenIds.add(payToken);
  }
  
  const lendOrderbooks = new Set<string>();
  const lendMarketCalls = [];
  for (let tokenId = 1; tokenId <= maxId; tokenId++) {
    lendMarketCalls.push({
      target: COMPOSITE_EXCHANGE,
      params: [tokenId],
    });
  }
  const lendMarketResults = await options.api.multiCall({ abi: ABI_GET_LEND, calls: lendMarketCalls });
  for (const address of lendMarketResults) {
    if (address && address !== CoreAssets.null && address !== "0x") {
      lendOrderbooks.add(String(address).toLowerCase());
    }
  }
  orderbooks.lendMarkets = Array.from(lendOrderbooks);

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
      orderbooks.tokenErc20Decimals[tokenId] = config.erc20Decimals || config.positionDecimals;
      orderbooks.tokenVaultDecimals[tokenId] = config.vaultDecimals;
      if (config.tokenAddress && config.tokenAddress !== CoreAssets.null) {
        orderbooks.tokenAddresses[tokenId] = config.tokenAddress;
      }
    } else {
      orderbooks.tokenDecimals[tokenId] = 8;
      orderbooks.tokenErc20Decimals[tokenId] = 8;
      orderbooks.tokenVaultDecimals[tokenId] = 8;
    }
  });
  
  return orderbooks;
}

function getFetch(type: 'PERPS' | 'SPOT') {
  return async (options: FetchOptions): Promise<FetchResult> => {
    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();
    
    const orderbooks = await getOrderbooks(options, type);
  
    if (Object.keys(orderbooks.markets).length === 0) {
      return {
        dailyVolume,
        dailyFees,
      };
    }
    
    const marketAddresses = Object.keys(orderbooks.markets);
    const marketLogs = await options.getLogs({
      targets: marketAddresses,
      eventAbi: SPOT_PERP_TRADE_EVENT,
      flatten: false,
    });
    
    for (let i = 0; i < marketAddresses.length; i++) {
      for (const log of marketLogs[i]) {
        const config = orderbooks.markets[marketAddresses[i]];
        if (!config) continue;
        
        const baseId = config.baseTokenId;
        const quoteId = config.quoteTokenId;
        const basePosD = orderbooks.tokenDecimals[baseId] ?? 8;
        const quotePosD = orderbooks.tokenDecimals[quoteId] ?? 8;
        const baseErc = orderbooks.tokenErc20Decimals[baseId] ?? basePosD;
        const quoteErc = orderbooks.tokenErc20Decimals[quoteId] ?? quotePosD;
        
        const { fromFee, toFee, fromQuantity, toQuantity } = parseMatchQuantities(BigInt(log.spotMatchQuantities));
        
        if (fromQuantity > 0n) {
          dailyVolume.add(orderbooks.tokenAddresses[baseId], positionRawToErc20Raw(fromQuantity, basePosD, baseErc))
        } else {
          dailyVolume.add(orderbooks.tokenAddresses[quoteId], positionRawToErc20Raw(toQuantity, quotePosD, quoteErc))
        }
        
        if (type === 'PERPS') {
          // Perp: both fees in quote (position raw)
          dailyFees.add(orderbooks.tokenAddresses[quoteId], positionRawToErc20Raw(fromFee + toFee, quotePosD, quoteErc), METRICS.PerpsFees)
        } else {
          // Spot: fromFee = buyer fee in base (position raw), toFee = seller fee in quote (position raw)
          dailyFees.add(orderbooks.tokenAddresses[baseId], positionRawToErc20Raw(fromFee, basePosD, baseErc), METRICS.SpotFees)
          dailyFees.add(orderbooks.tokenAddresses[quoteId], positionRawToErc20Raw(toFee, quotePosD, quoteErc), METRICS.SpotFees)
        }
      }
    }
    
    const interestPaidLogs = await options.getLogs({
      target: COMPOSITE_EXCHANGE,
      eventAbi: INTEREST_PAID_EVENT,
    });
    
    const positionIds = [...new Set((interestPaidLogs as any[]).map((l) => l.args?.positionId ?? l.positionId).filter(Boolean))];
    const positionToTokenId: Record<string, number> = {};
    
    const [closedLogs, changedLogs] = await Promise.all([
      options.getLogs({
        target: COMPOSITE_EXCHANGE,
        eventAbi: LEND_POSITION_CLOSED_EVENT,
      }),
      options.getLogs({
        target: COMPOSITE_EXCHANGE,
        eventAbi: LEND_POSITION_CHANGED_EVENT,
      }),
    ]);
    for (const log of closedLogs as any[]) {
      const positionId = String(log.positionId);
      const raw = log.lendMatch;
      if (positionId && raw != null && raw !== 0n) {
        const tid = tokenIdFromLendMatch(BigInt(raw));
        if (tid !== 0) positionToTokenId[positionId] = tid;
      }
    }
    for (const log of changedLogs as any[]) {
      const positionId = String(log.positionId);
      const raw = log.lendMatch;
      if (positionId && raw != null && raw !== 0n) {
        const tid = tokenIdFromLendingEventData(BigInt(raw));
        if (tid !== 0) positionToTokenId[positionId] = tid;
      }
    }
    
    const missingPositionIds = positionIds.filter((id) => positionToTokenId[String(id)] == null);
    if (missingPositionIds.length > 0) {
      const lendPositions = await options.api.multiCall({
        abi: ABI_GET_LEND_POSITION,
        target: COMPOSITE_EXCHANGE,
        calls: missingPositionIds.map((positionId) => ({ target: COMPOSITE_EXCHANGE, params: [positionId] })),
        permitFailure: true,
      });
      missingPositionIds.forEach((positionId, i) => {
        const raw = lendPositions[i];
        if (raw != null && raw !== 0n) {
          const tid = tokenIdFromLendMatch(BigInt(raw));
          if (tid !== 0) positionToTokenId[String(positionId)] = tid;
        }
      });
    }
    
    for (const log of interestPaidLogs as any[]) {
      const positionId = log.positionId
      const interestAndFeesRaw = log.interestAndFees;
      if (interestAndFeesRaw == null) continue;
      const { fees } = parseInterestPaidData(BigInt(interestAndFeesRaw));
      const tokenId = positionToTokenId[String(positionId)];
  
      if (fees === 0n) continue;
      if (tokenId == null || tokenId === 0) continue; // position closed/unreadable or invalid
      const vaultDecimals = orderbooks.tokenVaultDecimals[tokenId] ?? 18;
      const erc20Decimals = orderbooks.tokenErc20Decimals[tokenId] ?? vaultDecimals;
      const rawErc20 = vaultRawToErc20Raw(fees, vaultDecimals, erc20Decimals);
      
      dailyFees.add(orderbooks.tokenAddresses[tokenId], rawErc20, METRICS.LendingInterest);
    }
    
    const liquidationLogs = await options.getLogs({
      target: COMPOSITE_EXCHANGE,
      eventAbi: LIQUIDATION_EVENT,
    });
    const usdmVaultDecimals = orderbooks.tokenVaultDecimals[USDM_TOKEN_ID] ?? 18;
    const usdmErc20Decimals = orderbooks.tokenErc20Decimals[USDM_TOKEN_ID] ?? usdmVaultDecimals;
    for (const log of liquidationLogs as any[]) {
      const raw = log.liquidatoinPayoff
      if (raw == null) continue;
      const quantity = parseLiquidationPayoffQuantity(BigInt(raw));
      if (quantity === 0n) continue;
      const rawErc20 = vaultRawToErc20Raw(quantity, usdmVaultDecimals, usdmErc20Decimals);
      
      dailyFees.add(orderbooks.tokenAddresses[USDM_TOKEN_ID], rawErc20, METRICS.LiquidationFees);
    }
    
    return {
      dailyVolume,
      dailyFees,
      dailyRevenue: dailyFees,
      dailyProtocolRevenue: dailyFees,
    };
  }
}

export const perpsAdapter: SimpleAdapter = {
  version: 2,
  fetch: getFetch('PERPS'),
  chains: [CHAIN.MEGAETH],
  start: "2026-02-09",
  methodology: {
    Fees: 'Total perps trading fees + lending interest + liquidation fees.',
    Revenue: 'All fees are revenue',
    ProtocolRevenue: 'All revenue are collected by protocol.',
  },
  breakdownMethodology: {
    Fees: {
      [METRICS.PerpsFees]: 'Perps trading fees paid by users.',
      [METRICS.LendingInterest]: 'Lending interest charged by protocol.',
      [METRICS.LiquidationFees]: 'Liquidation fees collected by protocol.',
    },
    Revenue: {
      [METRICS.PerpsFees]: 'All perps trading fees are revenue.',
      [METRICS.LendingInterest]: 'All lending interest are revenue charged by protocol.',
      [METRICS.LiquidationFees]: 'All liquidation fees are revenue collected by protocol.',
    },
    ProtocolRevenue: {
      [METRICS.PerpsFees]: 'All perps trading fees are revenue collected by protocol.',
      [METRICS.LendingInterest]: 'All lending interest are revenue charged by protocol.',
      [METRICS.LiquidationFees]: 'All liquidation fees are revenue collected by protocol.',
    },
  }
};

export const spotAdapter: SimpleAdapter = {
  version: 2,
  fetch: getFetch('SPOT'),
  chains: [CHAIN.MEGAETH],
  start: "2026-02-09",
  methodology: {
    Fees: 'Total spot trading fees.',
    Revenue: 'All fees are revenue',
    ProtocolRevenue: 'All revenue are collected by protocol.',
  },
  breakdownMethodology: {
    Fees: {
      [METRICS.SpotFees]: 'Spot trading fees paid by users.',
    },
    Revenue: {
      [METRICS.SpotFees]: 'All spot trading fees are revenue.',
    },
    ProtocolRevenue: {
      [METRICS.SpotFees]: 'All spot trading fees are revenue collected by protocol.',
    },
  }
};
