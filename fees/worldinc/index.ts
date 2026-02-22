/**
 * World Inc (WCM) protocol fees on MegaETH.
 *
 * Returns fees in each asset's native currency (ERC20 raw per token). No oracle or USD conversion.
 * TOTAL = spot + perp + lend + liquidation, per tokenId, then added to Balances by token address.
 *
 * 1) SPOT (NewTrade): fromFee = buyer fee in base (position raw), toFee = seller fee in quote. Convert position raw -> ERC20 raw per token.
 * 2) PERP (NewTrade): both fromFee/toFee in quote; convert to ERC20 raw.
 * 3) LENDING (InterestPaid): fees = upper 128 bits, vault decimals; convert vault raw -> ERC20 raw.
 * 4) LIQUIDATION (Liquidation): payoff quantity in vault decimals (USDm); convert vault raw -> ERC20 raw.
 */
import { FetchOptions, FetchResultFees, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import {
  COMPOSITE_EXCHANGE,
  EXCHANGE_START_BLOCK,
  SPOT_PERP_TRADE_EVENT,
  ZERO_ADDRESS as ZERO,
  decodeVaultTokenConfig,
  parseSpotMatchQuantities,
  positionRawToErc20Raw,
} from "../../dexs/worldinc-perps/shared";

const INTEREST_PAID_EVENT = "event InterestPaid(uint64 indexed positionId, uint256 interestAndFees)";
// LendPositionClosed/Changed carry LendMatch or LendingEventData so we can get tokenId (readLendingPosition returns 0 for closed positions)
const LEND_POSITION_CLOSED_EVENT = "event LendPositionClosed(uint64 indexed positionId, uint256 lendMatch)";
const LEND_POSITION_CHANGED_EVENT = "event LendPositionChanged(uint64 indexed positionId, uint256 lendMatch)";
// LiquidationPayoff: bits 0–127 = quantity (uint128), 128–171 = liquidatorId, 172–215 = originalOwnerId (PublicStruct.sol)
const LIQUIDATION_EVENT = "event Liquidation(uint64 indexed userId, uint256 liquidatoinPayoff)";

const MASK_64 = BigInt("0xFFFFFFFFFFFFFFFF");
const MASK_32 = BigInt("0xFFFFFFFF");
const MASK_128 = (1n << 128n) - 1n;
const USDM_TOKEN_ID = 1;

/** InterestPaidData: lower 128 bits = interest, upper 128 bits = fees (PublicStruct.sol). */
function parseInterestPaidData(interestAndFees: bigint) {
  const interest = interestAndFees & MASK_128;
  const fees = interestAndFees >> 128n;
  return { interest, fees };
}

/** LiquidationPayoff (PublicStruct.sol): lower 128 bits = quantity (payoff to liquidator/protocol). */
function parseLiquidationPayoffQuantity(liquidatoinPayoff: bigint): bigint {
  return liquidatoinPayoff & MASK_128;
}

/** LendMatch: tokenId at bits 80-111 (PublicStruct.sol LendMatchLib.tokenId). */
function tokenIdFromLendMatch(lendMatchRaw: bigint): number {
  return Number((lendMatchRaw >> 80n) & MASK_32);
}

/** LendingEventData: token at bits 96-127 (PublicStruct.sol BitFormat comment). */
function tokenIdFromLendingEventData(lendingEventDataRaw: bigint): number {
  return Number((lendingEventDataRaw >> 96n) & MASK_32);
}

/** Convert vault-denominated raw amount to ERC20 raw (smallest unit). */
function vaultRawToErc20Raw(raw: bigint, vaultDecimals: number, erc20Decimals: number): bigint {
  if (vaultDecimals === erc20Decimals) return raw;
  if (erc20Decimals >= vaultDecimals) return raw * 10n ** BigInt(erc20Decimals - vaultDecimals);
  return raw / 10n ** BigInt(vaultDecimals - erc20Decimals);
}

async function discoverSpotAndPerpOrderbooks(api: any, exchangeAddress: string) {
  const orderbooks = new Set<string>();
  const orderbookConfigs: Record<string, { baseId: number; quoteId: number; type: "SPOT" | "PERP" }> = {};
  const spotOrderbooks = new Set<string>();
  const perpOrderbooks = new Set<string>();
  const tokenIds = new Set<number>();

  const highestTokenId = await api.call({
    abi: "function getHighestTokenId() external view returns (uint32)",
    target: exchangeAddress,
  });
  const maxId = Number(highestTokenId);

  const spotCalls: Array<{ target: string; params: [number, number] }> = [];
  const perpCalls: Array<{ target: string; params: [number, number] }> = [];
  for (let token1 = 1; token1 <= maxId; token1++) {
    for (let token2 = 1; token2 <= maxId; token2++) {
      if (token1 === token2) continue;
      spotCalls.push({ target: exchangeAddress, params: [token1, token2] });
      perpCalls.push({ target: exchangeAddress, params: [token1, token2] });
    }
  }

  const [spotResults, perpResults] = await Promise.all([
    api.multiCall({
      abi: "function getSpotOrderBook(uint32 token1, uint32 token2) external view returns (address, uint32 buyToken, uint32 payToken)",
      calls: spotCalls,
      permitFailure: true,
    }),
    api.multiCall({
      abi: "function getPerpOrderBook(uint32 token1, uint32 token2) external view returns (address, uint32 buyToken, uint32 payToken)",
      calls: perpCalls,
      permitFailure: true,
    }),
  ]);

  for (const result of spotResults as any[]) {
    if (!result?.[0]) continue;
    const addr = String(result[0]).toLowerCase();
    if (addr === ZERO || addr === "0x") continue;
    orderbooks.add(addr);
    orderbookConfigs[addr] = { baseId: Number(result[1]), quoteId: Number(result[2]), type: "SPOT" };
    spotOrderbooks.add(addr);
    tokenIds.add(Number(result[1]));
    tokenIds.add(Number(result[2]));
  }
  for (const result of perpResults as any[]) {
    if (!result?.[0]) continue;
    const addr = String(result[0]).toLowerCase();
    if (addr === ZERO || addr === "0x") continue;
    orderbooks.add(addr);
    orderbookConfigs[addr] = { baseId: Number(result[1]), quoteId: Number(result[2]), type: "PERP" };
    perpOrderbooks.add(addr);
    tokenIds.add(Number(result[1]));
    tokenIds.add(Number(result[2]));
  }

  const lendOrderbooks = new Set<string>();
  for (let tokenId = 1; tokenId <= maxId; tokenId++) {
    try {
      const addr = await api.call({
        abi: "function getLendOrderBook(uint32 tokenId) external view returns (address)",
        target: exchangeAddress,
        params: [tokenId],
      });
      const a = String(addr).toLowerCase();
      if (a && a !== ZERO && a !== "0x") {
        lendOrderbooks.add(a);
        tokenIds.add(tokenId);
      }
    } catch {
      // ignore
    }
  }

  const tokenConfigCalls = Array.from(tokenIds).map((tokenId) => ({
    target: exchangeAddress,
    params: [tokenId],
  }));

  const tokenConfigs = await api.multiCall({
    abi: "function readTokenConfig(uint32 tokenId) external view returns (uint256)",
    calls: tokenConfigCalls,
    permitFailure: true,
  });

  const tokenDecimals: Record<number, number> = {};
  const tokenVaultDecimals: Record<number, number> = {};
  const tokenErc20Decimals: Record<number, number> = {};
  const tokenAddresses: Record<number, string> = {};
  const tokenIdsArray = Array.from(tokenIds);
  tokenIdsArray.forEach((tokenId, i) => {
    if (tokenConfigs[i] && tokenConfigs[i] !== 0n) {
      const cfg = decodeVaultTokenConfig(BigInt(tokenConfigs[i]));
      tokenDecimals[tokenId] = cfg.positionDecimals;
      tokenVaultDecimals[tokenId] = cfg.vaultDecimals;
      tokenErc20Decimals[tokenId] = cfg.erc20Decimals || cfg.positionDecimals;
      if (cfg.tokenAddress && cfg.tokenAddress !== ZERO) tokenAddresses[tokenId] = cfg.tokenAddress;
    } else {
      tokenDecimals[tokenId] = 8;
      tokenVaultDecimals[tokenId] = 8;
      tokenErc20Decimals[tokenId] = 8;
    }
  });

  return {
    orderbooks: Array.from(orderbooks),
    orderbookConfigs,
    tokenDecimals,
    tokenVaultDecimals,
    tokenErc20Decimals,
    tokenAddresses,
    spotOrderbooks: Array.from(spotOrderbooks),
    perpOrderbooks: Array.from(perpOrderbooks),
    lendOrderbooks: Array.from(lendOrderbooks),
  };
}

const fetch = async (options: FetchOptions): Promise<FetchResultFees> => {
  const { getLogs, api, getFromBlock, getToBlock, createBalances } = options;
  const dailyFees = createBalances();
  const dailyProtocolRevenue = createBalances();

  let fromBlock = await getFromBlock();
  const toBlock = await getToBlock();
  if (fromBlock == null || toBlock == null) return { dailyFees, dailyProtocolRevenue };
  fromBlock = Math.max(fromBlock, EXCHANGE_START_BLOCK);

  let orderbookData: {
    orderbooks: string[];
    orderbookConfigs: Record<string, { baseId: number; quoteId: number; type: "SPOT" | "PERP" }>;
    tokenDecimals: Record<number, number>;
    tokenVaultDecimals: Record<number, number>;
    tokenErc20Decimals: Record<number, number>;
    tokenAddresses: Record<number, string>;
    spotOrderbooks: string[];
    perpOrderbooks: string[];
    lendOrderbooks: string[];
  };
  try {
    orderbookData = await discoverSpotAndPerpOrderbooks(api, COMPOSITE_EXCHANGE);
  } catch {
    return { dailyFees, dailyProtocolRevenue };
  }

  const { orderbooks, orderbookConfigs, tokenDecimals, tokenVaultDecimals, tokenErc20Decimals, tokenAddresses } = orderbookData;

  if (orderbooks.length === 0) return { dailyFees, dailyProtocolRevenue };

  const tradeLogs = await getLogs({
    targets: orderbooks,
    eventAbi: SPOT_PERP_TRADE_EVENT,
    fromBlock,
    toBlock,
    entireLog: true,
  });

  /** Fees per tokenId in ERC20 raw (smallest unit). No USD conversion. */
  const feesByTokenIdRaw: Record<number, bigint> = {};
  function addFeeRawByToken(tokenId: number, rawErc20: bigint) {
    if (!feesByTokenIdRaw[tokenId]) feesByTokenIdRaw[tokenId] = 0n;
    feesByTokenIdRaw[tokenId] += rawErc20;
  }

  for (const log of tradeLogs as any[]) {
    const args = log.args ?? log.parsedLog?.args ?? log;
    const smq = args.spotMatchQuantities;
    if (!smq) continue;
    const orderbookAddr = (log.address ?? log.srcAddress ?? log.target)?.toLowerCase();
    const config = orderbookConfigs[orderbookAddr];
    if (!config) continue;

    const { fromFee, toFee } = parseSpotMatchQuantities(BigInt(smq));
    const basePosD = tokenDecimals[config.baseId] ?? 8;
    const quotePosD = tokenDecimals[config.quoteId] ?? 8;
    const baseErc = tokenErc20Decimals[config.baseId] ?? basePosD;
    const quoteErc = tokenErc20Decimals[config.quoteId] ?? quotePosD;

    if (config.type === "SPOT") {
      // Spot: fromFee = buyer fee in base (position raw), toFee = seller fee in quote (position raw)
      const baseRaw = positionRawToErc20Raw(fromFee, basePosD, baseErc);
      const quoteRaw = positionRawToErc20Raw(toFee, quotePosD, quoteErc);
      addFeeRawByToken(config.baseId, baseRaw);
      addFeeRawByToken(config.quoteId, quoteRaw);
    } else {
      // Perp: both fees in quote (position raw)
      const quoteRaw = positionRawToErc20Raw(fromFee + toFee, quotePosD, quoteErc);
      addFeeRawByToken(config.quoteId, quoteRaw);
    }
  }

  // --- InterestPaid (lending): emitted by CompositeExchange, not by lend orderbooks ---
  let interestPaidLogs: any[] = [];
  try {
    interestPaidLogs = await getLogs({
      targets: [COMPOSITE_EXCHANGE],
      eventAbi: INTEREST_PAID_EVENT,
      fromBlock,
      toBlock,
    });
  } catch {
    // no InterestPaid or getLogs not supported on this chain
  }

  const positionIds = [...new Set((interestPaidLogs as any[]).map((l) => l.args?.positionId ?? l.positionId).filter(Boolean))];
  const positionToTokenId: Record<string, number> = {};

  // Build positionId -> tokenId from LendPositionClosed/Changed (readLendingPosition returns 0 for closed positions)
  try {
    const [closedLogs, changedLogs] = await Promise.all([
      getLogs({
        targets: [COMPOSITE_EXCHANGE],
        eventAbi: LEND_POSITION_CLOSED_EVENT,
        fromBlock,
        toBlock,
      }),
      getLogs({
        targets: [COMPOSITE_EXCHANGE],
        eventAbi: LEND_POSITION_CHANGED_EVENT,
        fromBlock,
        toBlock,
      }),
    ]);
    for (const log of closedLogs as any[]) {
      const positionId = String(log.args?.positionId ?? log.positionId ?? log.args?.[0]);
      const raw = log.args?.lendMatch ?? log.lendMatch ?? log.args?.[1];
      if (positionId && raw != null && raw !== 0n) {
        const tid = tokenIdFromLendMatch(BigInt(raw));
        if (tid !== 0) positionToTokenId[positionId] = tid;
      }
    }
    for (const log of changedLogs as any[]) {
      const positionId = String(log.args?.positionId ?? log.positionId ?? log.args?.[0]);
      const raw = log.args?.lendMatch ?? log.lendMatch ?? log.args?.[1];
      if (positionId && raw != null && raw !== 0n) {
        const tid = tokenIdFromLendingEventData(BigInt(raw));
        if (tid !== 0) positionToTokenId[positionId] = tid;
      }
    }
  } catch {
    // ignore
  }

  const missingPositionIds = positionIds.filter((id) => positionToTokenId[String(id)] == null);
  if (missingPositionIds.length > 0) {
    const lendPositions = await api.multiCall({
      abi: "function readLendingPosition(uint64 positionId) external view returns (uint256)",
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
    const args = log.args ?? log.parsedLog?.args ?? log;
    const positionId = args.positionId ?? args[0];
    const interestAndFeesRaw = args.interestAndFees ?? args[1];
    if (interestAndFeesRaw == null) continue;
    const { fees } = parseInterestPaidData(BigInt(interestAndFeesRaw));
    const tokenId = positionToTokenId[String(positionId)];

    if (fees === 0n) continue;
    if (tokenId == null || tokenId === 0) continue; // position closed/unreadable or invalid
    const vaultDecimals = tokenVaultDecimals[tokenId] ?? 18;
    const erc20Decimals = tokenErc20Decimals[tokenId] ?? vaultDecimals;
    const rawErc20 = vaultRawToErc20Raw(fees, vaultDecimals, erc20Decimals);
    addFeeRawByToken(tokenId, rawErc20);
  }

  // --- Liquidation: payoff quantity (lower 128 bits of LiquidationPayoff) is the fee; assume USDm (token 1) for USD conversion
  let liquidationLogs: any[] = [];
  try {
    liquidationLogs = await getLogs({
      targets: [COMPOSITE_EXCHANGE],
      eventAbi: LIQUIDATION_EVENT,
      fromBlock,
      toBlock,
    });
  } catch {
    // no Liquidation or getLogs not supported
  }

  // LiquidationPayoff quantity is in vault decimals (USDm = tokenId 1)
  const usdmVaultDecimals = tokenVaultDecimals[USDM_TOKEN_ID] ?? 18;
  const usdmErc20Decimals = tokenErc20Decimals[USDM_TOKEN_ID] ?? usdmVaultDecimals;
  for (const log of liquidationLogs as any[]) {
    const args = log.args ?? log.parsedLog?.args ?? log;
    const raw = args.liquidatoinPayoff ?? args[1];
    if (raw == null) continue;
    const quantity = parseLiquidationPayoffQuantity(BigInt(raw));
    if (quantity === 0n) continue;
    const rawErc20 = vaultRawToErc20Raw(quantity, usdmVaultDecimals, usdmErc20Decimals);
    addFeeRawByToken(USDM_TOKEN_ID, rawErc20);
  }

  // Return fees in each asset (ERC20 raw). Downstream can convert to USD.
  for (const [tokenIdStr, raw] of Object.entries(feesByTokenIdRaw)) {
    const tokenId = Number(tokenIdStr);
    const addr = tokenAddresses[tokenId];
    if (!addr || addr === ZERO || raw === 0n) continue;
    dailyFees.add(addr, raw);
    dailyProtocolRevenue.add(addr, raw);
  }

  return {
    dailyFees,
    dailyProtocolRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.MEGAETH],
  start: "2026-02-01",
  methodology: {
    Fees: "Fees returned per asset (ERC20 raw): spot (base/quote), perp (quote), lending (position token), liquidation (USDm). No oracle; downstream converts to USD.",
    ProtocolRevenue: "Same as fees (per-asset raw).",
  },
};

export default adapter;
