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

const v1Abi = "function getAllAssetInfo() view returns (tuple(bytes32 symbol, address tokenAddress, uint8 id, uint8 decimals, uint56 flags, uint24 _flagsPadding, uint32 initialMarginRate, uint32 maintenanceMarginRate, uint32 minProfitRate, uint32 minProfitTime, uint32 positionFeeRate, address referenceOracle, uint32 referenceDeviation, uint8 referenceOracleType, uint32 halfSpread, uint96 credit, uint128 _reserved2, uint96 collectedFee, uint32 liquidationFeeRate, uint96 spotLiquidity, uint96 maxLongPositionSize, uint96 totalLongPosition, uint96 averageLongPrice, uint96 maxShortPositionSize, uint96 totalShortPosition, uint96 averageShortPrice, address muxTokenAddress, uint32 spotWeight, uint32 longFundingBaseRate8H, uint32 longFundingLimitRate8H, uint128 longCumulativeFundingRate, uint128 shortCumulativeFunding)[])";

const mux3ListPoolsAbi = "function listCollateralPool() view returns (address[])";
const mux3MarketStatesAbi = "function marketStates() view returns (bytes32[] marketIds, tuple(bool isLong, uint256 totalSize, uint256 averageEntryPrice, uint256 cumulatedBorrowingPerUsd, uint256 lastBorrowingUpdateTime)[] states)";

const degenPoolStorageAbi = "function getPoolStorage() view returns (uint8 assetsCount, uint32 sequence, uint32 lastFundingTime, uint32 brokerTransactions)";
const degenAssetAbi = "function getAssetStorageV2(uint8 assetId) view returns (uint56 flags, uint96 spotLiquidity, uint96 totalLongPosition, uint96 averageLongPrice, uint96 totalShortPosition, uint96 averageShortPrice, uint128 longCumulativeFunding, uint128 shortCumulativeFunding)";

const toUsd = (size: any, price: any) => (Number(size) / 1e18) * (Number(price) / 1e18);

const fetch = async (options: FetchOptions) => {
  const { chain, api, createBalances } = options;
  const cfg = chainConfig[chain];
  const longOpenInterestAtEnd = createBalances();
  const shortOpenInterestAtEnd = createBalances();
  const openInterestAtEnd = createBalances();

  const addLong = (usd: number) => {
    if (usd > 0) { longOpenInterestAtEnd.addUSDValue(usd); openInterestAtEnd.addUSDValue(usd); }
  };
  const addShort = (usd: number) => {
    if (usd > 0) { shortOpenInterestAtEnd.addUSDValue(usd); openInterestAtEnd.addUSDValue(usd); }
  };

  const v1Assets: any[] = await api.call({ target: cfg.v1Pool, abi: v1Abi });
  for (const a of v1Assets) {
    if (BigInt(a.flags) & ASSET_IS_STABLE) continue;
    addLong(toUsd(a.totalLongPosition, a.averageLongPrice));
    addShort(toUsd(a.totalShortPosition, a.averageShortPrice));
  }

  if (cfg.mux3) {
    const pools: string[] = await api.call({ target: cfg.mux3, abi: mux3ListPoolsAbi });
    const results = await api.multiCall({ abi: mux3MarketStatesAbi, calls: pools.map((target) => ({ target })) });
    for (const res of results) {
      for (const s of res.states ?? res[1]) {
        if (s.isLong) addLong(toUsd(s.totalSize, s.averageEntryPrice));
        else addShort(toUsd(s.totalSize, s.averageEntryPrice));
      }
    }
  }

  if (cfg.degenPool) {
    const poolStorage = await api.call({ target: cfg.degenPool, abi: degenPoolStorageAbi });
    const assetsCount = Number(poolStorage.assetsCount ?? poolStorage[0]);
    const calls = Array.from({ length: assetsCount }, (_, id) => ({ target: cfg.degenPool!, params: [id] }));
    const assets = await api.multiCall({ abi: degenAssetAbi, calls });
    for (const a of assets) {
      if (BigInt(a.flags) & ASSET_IS_STABLE) continue;
      addLong(toUsd(a.totalLongPosition, a.averageLongPrice));
      addShort(toUsd(a.totalShortPosition, a.averageShortPrice));
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
