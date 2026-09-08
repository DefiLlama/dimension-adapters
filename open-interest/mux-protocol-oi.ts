import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// MUX has three native peer-to-pool products: MUX V1 (MUXLP), MUX V3 (MUX3LP) and MUX Degen (DegenLP).
type ChainCfg = {
  v1Pool: string;      // MUX V1 LiquidityPool (MUXLP)
  mux3?: string;       // MUX V3 core diamond, exposes listCollateralPool() (MUX3LP)
  degenPool?: string;  // MUX Degen pool (DegenLP)
  start: string;
};

const chainConfig: Record<string, ChainCfg> = {
  [CHAIN.ARBITRUM]: {
    v1Pool: "0x3e0199792Ce69DC29A0a36146bFa68bd7C8D6633",
    mux3: "0x85c8F4a67F4f9AD7b38e875c8FeDE7F4c878bFAc",
    degenPool: "0x2f977A859eD91c729c781ba0e50927d5Da3Cb988",
    start: "2022-08-01",
  },
  [CHAIN.BSC]: { v1Pool: "0x855E99F768FaD76DD0d3EB7c446C0b759C96D520", start: "2022-08-01" },
  [CHAIN.AVAX]: { v1Pool: "0x0bA2e492e8427fAd51692EE8958eBf936bEE1d84", start: "2022-08-01" },
  [CHAIN.OPTIMISM]: { v1Pool: "0xc6bd76fa1e9e789345e003b361e4a0037dfb7260", start: "2023-01-05" },
  [CHAIN.FANTOM]: { v1Pool: "0x2e81F443A11a943196c88afcB5A0D807721A88E6", start: "2022-08-01" },
};

const ASSET_IS_STABLE = 1n; // flags bit 0 -> collateral-only asset, never a perp market

// V1 ─────────────────────────────────────────────────────────────────────────
const v1Abi = "function getAllAssetInfo() view returns (tuple(bytes32 symbol, address tokenAddress, uint8 id, uint8 decimals, uint56 flags, uint24 _flagsPadding, uint32 initialMarginRate, uint32 maintenanceMarginRate, uint32 minProfitRate, uint32 minProfitTime, uint32 positionFeeRate, address referenceOracle, uint32 referenceDeviation, uint8 referenceOracleType, uint32 halfSpread, uint96 credit, uint128 _reserved2, uint96 collectedFee, uint32 liquidationFeeRate, uint96 spotLiquidity, uint96 maxLongPositionSize, uint96 totalLongPosition, uint96 averageLongPrice, uint96 maxShortPositionSize, uint96 totalShortPosition, uint96 averageShortPrice, address muxTokenAddress, uint32 spotWeight, uint32 longFundingBaseRate8H, uint32 longFundingLimitRate8H, uint128 longCumulativeFundingRate, uint128 shortCumulativeFunding)[])";

// V3 ─────────────────────────────────────────────────────────────────────────
const mux3ListPoolsAbi = "function listCollateralPool() view returns (address[])";
const mux3MarketStatesAbi = "function marketStates() view returns (bytes32[] marketIds, tuple(bool isLong, uint256 totalSize, uint256 averageEntryPrice, uint256 cumulatedBorrowingPerUsd, uint256 lastBorrowingUpdateTime)[] states)";
const mux3MarketConfigAbi = "function marketConfigValue(bytes32 marketId, bytes32 key) view returns (bytes32)";
// keccak256("MM_ORACLE_ID") — maps marketId to its oracle token address in the V3 config map
const MM_ORACLE_ID_KEY = "0xf3c6c160f3e3fc9d675ea5ac050b9383acf9b7fd91effc94a12a0b64ab0a5d14";

// Degen ───────────────────────────────────────────────────────────────────────
const degenPoolStorageAbi = "function getPoolStorage() view returns (uint8 assetsCount, uint32 sequence, uint32 lastFundingTime, uint32 brokerTransactions)";
const degenAssetAbi = "function getAssetStorageV2(uint8 assetId) view returns (uint56 flags, uint96 spotLiquidity, uint96 totalLongPosition, uint96 averageLongPrice, uint96 totalShortPosition, uint96 averageShortPrice, uint128 longCumulativeFunding, uint128 shortCumulativeFunding)";
const degenAssetParamAbi = "function getAssetParameter(uint8 assetId, bytes32 key) view returns (bytes32)";
// keccak256("TOKEN_ADDRESS") and keccak256("DECIMALS") from LibConfigKeys.sol
const DEGEN_TOKEN_ADDRESS_KEY = "0xcdaa6011bb84469257efe01038cbac5c53a24de125fa1be5e42a073f38b0b55a";
const DEGEN_DECIMALS_KEY = "0x08593985ae1bebfb02f6c30105edffb176a6d87c9fad54c434bf9b58f67e81b6";

// All three pools normalise position sizes to 1e18 regardless of the token's own decimals.
// Convert back to native decimals so createBalances().add() can price via DeFiLlama.
const normalizeSize = (size: any, tokenDecimals: number): bigint => {
  if (tokenDecimals === 18) return BigInt(size);
  return (BigInt(size) * (10n ** BigInt(tokenDecimals))) / (10n ** 18n);
};

const fetch = async (options: FetchOptions) => {
  const { chain, api, createBalances } = options;
  const cfg = chainConfig[chain];
  const longOpenInterestAtEnd = createBalances();
  const shortOpenInterestAtEnd = createBalances();
  const openInterestAtEnd = createBalances();

  const addOI = (token: string, size: bigint, isLong: boolean) => {
    if (size <= 0n) return;
    (isLong ? longOpenInterestAtEnd : shortOpenInterestAtEnd).add(token, size);
    openInterestAtEnd.add(token, size);
  };

  // V1 ─────────────────────────────────────────────────────────────
  const v1Assets: any[] = await api.call({ target: cfg.v1Pool, abi: v1Abi });
  for (const a of v1Assets) {
    if (BigInt(a.flags) & ASSET_IS_STABLE) continue;
    if (a.tokenAddress === "0x0000000000000000000000000000000000000000") continue;
    const dec = Number(a.decimals);
    addOI(a.tokenAddress, normalizeSize(a.totalLongPosition, dec), true);
    addOI(a.tokenAddress, normalizeSize(a.totalShortPosition, dec), false);
  }

  // V3 ─────────────────────────────────────────────────────────────
  if (cfg.mux3) {
    const pools: string[] = await api.call({ target: cfg.mux3, abi: mux3ListPoolsAbi });
    const results = await api.multiCall({ abi: mux3MarketStatesAbi, calls: pools.map((p) => ({ target: p })) });

    // Each unique marketId maps to an oracleId returned by the core diamond's config map.
    // For standard assets the oracleId = bytes32(bytes20(tokenAddr)) — token address in the
    // first 20 bytes, zero-padded in the last 12. Extract and price via DeFiLlama.
    const marketIdSet = new Set<string>();
    for (const res of results) {
      for (const id of (res.marketIds ?? res[0]) as string[]) marketIdSet.add(id);
    }
    const uniqueMarketIds = [...marketIdSet];

    const rawOracleIds = await api.multiCall({
      abi: mux3MarketConfigAbi,
      target: cfg.mux3,
      calls: uniqueMarketIds.map((id) => ({ params: [id, MM_ORACLE_ID_KEY] })),
      permitFailure: true,
    });

    // oracleId encodes a token address when its last 12 bytes are zero.
    const tokenByMarket: Record<string, string> = {};
    uniqueMarketIds.forEach((marketId, i) => {
      const oid = rawOracleIds[i] as string | null;
      if (!oid) return;
      if (oid.slice(-24) !== "0".repeat(24)) return; // non-address oracle (e.g. WLFI string ID)
      const addr = "0x" + oid.slice(2, 42);
      if (addr === "0x0000000000000000000000000000000000000000") return;
      tokenByMarket[marketId] = addr;
    });

    const uniqueTokens = [...new Set(Object.values(tokenByMarket))];
    const rawDecimals = await api.multiCall({
      abi: "uint8:decimals",
      calls: uniqueTokens.map((t) => ({ target: t })),
      permitFailure: true,
    });
    const decimalsByToken: Record<string, number> = {};
    uniqueTokens.forEach((t, i) => {
      if (rawDecimals[i] != null) decimalsByToken[t.toLowerCase()] = Number(rawDecimals[i]);
    });

    for (const res of results) {
      const marketIds = (res.marketIds ?? res[0]) as string[];
      const states = (res.states ?? res[1]) as any[];
      for (let i = 0; i < states.length; i++) {
        const token = tokenByMarket[marketIds[i]];
        if (!token) continue;
        const dec = decimalsByToken[token.toLowerCase()];
        if (dec == null) continue;
        addOI(token, normalizeSize(states[i].totalSize, dec), states[i].isLong);
      }
    }
  }

  // Degen ───────────────────────────────────────────────────────────
  if (cfg.degenPool) {
    const poolStorage = await api.call({ target: cfg.degenPool, abi: degenPoolStorageAbi });
    const assetsCount = Number(poolStorage.assetsCount ?? poolStorage[0]);
    const ids = Array.from({ length: assetsCount }, (_, i) => i);

    const [assets, rawTokenAddrs, rawDecimals] = await Promise.all([
      api.multiCall({ abi: degenAssetAbi, calls: ids.map((id) => ({ target: cfg.degenPool!, params: [id] })) }),
      api.multiCall({ abi: degenAssetParamAbi, calls: ids.map((id) => ({ target: cfg.degenPool!, params: [id, DEGEN_TOKEN_ADDRESS_KEY] })), permitFailure: true }),
      api.multiCall({ abi: degenAssetParamAbi, calls: ids.map((id) => ({ target: cfg.degenPool!, params: [id, DEGEN_DECIMALS_KEY] })), permitFailure: true }),
    ]);

    for (let i = 0; i < assets.length; i++) {
      const a = assets[i];
      if (BigInt(a.flags) & ASSET_IS_STABLE) continue;
      const addrRaw = rawTokenAddrs[i] as string | null;
      const decRaw = rawDecimals[i] as string | null;
      if (!addrRaw || !decRaw) continue;
      // getAssetParameter returns bytes32; token address is left-padded (address(uint160(uint256(v))))
      const token = "0x" + addrRaw.slice(-40);
      if (token === "0x0000000000000000000000000000000000000000") continue;
      const dec = Number(BigInt(decRaw));
      addOI(token, normalizeSize(a.totalLongPosition, dec), true);
      addOI(token, normalizeSize(a.totalShortPosition, dec), false);
    }
  }

  return { openInterestAtEnd, longOpenInterestAtEnd, shortOpenInterestAtEnd };
};

const adapter: SimpleAdapter = {
  version: 2,
  runAtCurrTime: true,
  fetch,
  adapter: Object.fromEntries(
    Object.entries(chainConfig).map(([chain, { start }]) => [chain, { start }])
  ),
};

export default adapter;
