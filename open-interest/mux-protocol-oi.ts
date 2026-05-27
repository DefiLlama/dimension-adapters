import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const chainConfig: Record<string, { pool: string; start: string }> = {
  [CHAIN.ARBITRUM]: { pool: "0x3e0199792Ce69DC29A0a36146bFa68bd7C8D6633", start: "2022-08-01" },
  [CHAIN.BSC]: { pool: "0x855E99F768FaD76DD0d3EB7c446C0b759C96D520", start: "2022-08-01" },
  [CHAIN.AVAX]: { pool: "0x0bA2e492e8427fAd51692EE8958eBf936bEE1d84", start: "2022-08-01" },
  [CHAIN.OPTIMISM]: { pool: "0xc6bd76fa1e9e789345e003b361e4a0037dfb7260", start: "2023-01-05" },
  [CHAIN.FANTOM]: { pool: "0x2e81F443A11a943196c88afcB5A0D807721A88E6", start: "2022-08-01" },
};

const getAllAssetInfoAbi = "function getAllAssetInfo() view returns (tuple(bytes32 symbol, address tokenAddress, uint8 id, uint8 decimals, uint56 flags, uint24 _flagsPadding, uint32 initialMarginRate, uint32 maintenanceMarginRate, uint32 minProfitRate, uint32 minProfitTime, uint32 positionFeeRate, address referenceOracle, uint32 referenceDeviation, uint8 referenceOracleType, uint32 halfSpread, uint96 credit, uint128 _reserved2, uint96 collectedFee, uint32 liquidationFeeRate, uint96 spotLiquidity, uint96 maxLongPositionSize, uint96 totalLongPosition, uint96 averageLongPrice, uint96 maxShortPositionSize, uint96 totalShortPosition, uint96 averageShortPrice, address muxTokenAddress, uint32 spotWeight, uint32 longFundingBaseRate8H, uint32 longFundingLimitRate8H, uint128 longCumulativeFundingRate, uint128 shortCumulativeFunding)[] memory)";

const fetch = async (options: FetchOptions) => {
  const { chain, api, createBalances } = options;
  const longOpenInterestAtEnd = createBalances();
  const shortOpenInterestAtEnd = createBalances();
  const openInterestAtEnd = createBalances();

  const assets: any[] = await api.call({ target: chainConfig[chain].pool, abi: getAllAssetInfoAbi });

  for (const asset of assets) {
    if (BigInt(asset.flags) & 1n) continue;

    const decimals = Number(asset.decimals);
    const base = 10n ** 18n;
    const scale = 10n ** BigInt(decimals);

    const rawLong = BigInt(asset.totalLongPosition) * scale / base;
    const rawShort = BigInt(asset.totalShortPosition) * scale / base;

    if (rawLong > 0n) {
      longOpenInterestAtEnd.add(asset.tokenAddress, rawLong);
      openInterestAtEnd.add(asset.tokenAddress, rawLong);
    }
    if (rawShort > 0n) {
      shortOpenInterestAtEnd.add(asset.tokenAddress, rawShort);
      openInterestAtEnd.add(asset.tokenAddress, rawShort);
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
