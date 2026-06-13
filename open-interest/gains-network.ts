import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const chainConfigs: Record<string, { diamond: string; start: string }> = {
  // Source: Gains docs, active GNSMultiCollatDiamond contracts.
  [CHAIN.POLYGON]: { diamond: "0x209A9A01980377916851af2cA075C2b170452018", start: "2025-08-04" },
  [CHAIN.ARBITRUM]: { diamond: "0xFF162c694eAA571f685030649814282eA457f169", start: "2025-08-04" },
  [CHAIN.BASE]: { diamond: "0x6cD5aC19a07518A8092eEFfDA4f1174C72704eeb", start: "2025-08-04" },
  [CHAIN.APECHAIN]: { diamond: "0x2BE5D7058AdBa14Bc38E4A83E94A81f7491b0163", start: "2025-08-04" },
  [CHAIN.MEGAETH]: { diamond: "0x2D5B1ba6E2093a5b927Fe5bF8C049B107de31eaF", start: "2026-02-09" },
};

const ABIS = {
  pairsCount: "function pairsCount() view returns (uint256)",
  getCollaterals:
    "function getCollaterals() view returns ((address collateral, bool isActive, uint88 __placeholder, uint128 precision, uint128 precisionDelta)[])",
  getPairOisBeforeV10Collateral:
    "function getPairOisBeforeV10Collateral(uint8 _collateralIndex, uint16 _pairIndex) view returns (uint256 longOi, uint256 shortOi)",
  getPairOisAfterV10Collateral:
    "function getPairOisAfterV10Collateral(uint8[] _collateralIndex, uint16[] _pairIndex) view returns ((uint128 oiLongCollateral, uint128 oiShortCollateral)[])",
};

const bn = (value: any) => BigInt(value?.toString?.() ?? value ?? 0);

const fetch = async (options: FetchOptions) => {
  const config = chainConfigs[options.chain];
  const api = options.api;
  const longOpenInterestAtEnd = options.createBalances();
  const shortOpenInterestAtEnd = options.createBalances();
  const openInterestAtEnd = options.createBalances();

  const [collateralsResult, pairCount] = await api.batchCall([
    { target: config.diamond, abi: ABIS.getCollaterals },
    { target: config.diamond, abi: ABIS.pairsCount },
  ]);
  const collaterals = collateralsResult.flatMap((collateral: any, i: number) =>
    (collateral.isActive ?? collateral[1]) ? [{ collateralIndex: i + 1, collateral: collateral.collateral ?? collateral[0] }] : []
  );
  const pairIndexes = Array.from({ length: Number(pairCount?.toString?.() ?? pairCount) }, (_, i) => i);

  const beforeV10Ois = await api.multiCall({
    abi: ABIS.getPairOisBeforeV10Collateral,
    calls: collaterals.flatMap(({ collateralIndex }: any) =>
      pairIndexes.map((pairIndex) => ({ target: config.diamond, params: [collateralIndex, pairIndex] }))
    ),
  });
  const afterV10Ois = await api.multiCall({
    abi: ABIS.getPairOisAfterV10Collateral,
    calls: collaterals.flatMap(({ collateralIndex }: any) =>
      pairIndexes.map((pairIndex) => ({
        target: config.diamond,
        params: [[collateralIndex], [pairIndex]],
      }))
    ),
  });

  collaterals.forEach(({ collateral }: any, collateralIndex: number) => {
    pairIndexes.forEach((_pairIndex, i) => {
      const beforeV10 = beforeV10Ois[collateralIndex * pairIndexes.length + i];
      const afterV10 = afterV10Ois[collateralIndex * pairIndexes.length + i][0];
      const longOi = bn(beforeV10.longOi) + bn(afterV10.oiLongCollateral);
      const shortOi = bn(beforeV10.shortOi) + bn(afterV10.oiShortCollateral);
      if (longOi) {
        longOpenInterestAtEnd.add(collateral, longOi);
        openInterestAtEnd.add(collateral, longOi);
      }
      if (shortOi) {
        shortOpenInterestAtEnd.add(collateral, shortOi);
        openInterestAtEnd.add(collateral, shortOi);
      }
    });
  });

  return { openInterestAtEnd, longOpenInterestAtEnd, shortOpenInterestAtEnd };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  adapter: chainConfigs,
};

export default adapter;
