import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getERC4626VaultsInfo } from "../helpers/erc4626";
import { getConfig } from "../helpers/cache";
import { METRIC } from "../helpers/metrics";

const methodology = {
  Fees: "Fees generated from staking assets in LRT vaults.",
  Revenue: "Protocol fees charged on Core vaults",
  ProtocolRevenue: "All the revenue goes to protocol",
  SupplySideRevenue: "Yields distributed to supply side depositors",
};

const MellowAbis: any = {
  oracle: 'address:oracle',
  totalSupply: 'uint256:totalSupply',
  asset: 'function assetAt(uint256) view returns (address)',
  priceReport: 'function getReport(address) view returns (tuple(uint224,uint32,bool))',
  shareManager: 'address:shareManager',
  reportHandledEvent: 'event ReportHandled (address indexed asset, uint224 indexed priceD18, uint32 depositTimestamp, uint32 redeemTimestamp, uint256 fees)'
}

const chainConfig: Record<string, Record<string, string | number>> = {
  [CHAIN.ETHEREUM]: { chainId: 1, start: '2024-09-01' },
  [CHAIN.BSC]: { chainId: 56, start: '2025-07-27' },
  [CHAIN.MONAD]: { chainId: 143, start: '2025-11-21' },
  [CHAIN.FRAXTAL]: { chainId: 252, start: '2025-07-18' },
  [CHAIN.LISK]: { chainId: 1135, start: '2025-05-13' },
}

async function getCoreVaultInfo(options: FetchOptions, vaults: string[]): Promise<any> {
  const assets = await options.api.multiCall({
    calls: vaults.map(vault => ({ target: vault, params: 0 })),
    abi: MellowAbis.asset,
  });

  const shareManagers = await options.api.multiCall({
    calls: vaults,
    abi: MellowAbis.shareManager
  });

  const totalSupplies = await options.api.multiCall({
    calls: shareManagers,
    abi: MellowAbis.totalSupply
  });

  const oracles = await options.api.multiCall({
    calls: vaults,
    abi: MellowAbis.oracle
  });

  const priceConvertionsBefore = await options.fromApi.multiCall({
    calls: oracles.map((oracle, index) => ({ target: oracle, params: assets[index] })),
    abi: MellowAbis.priceReport
  });

  const priceConvertionsAfter = await options.toApi.multiCall({
    calls: oracles.map((oracle, index) => ({ target: oracle, params: assets[index] })),
    abi: MellowAbis.priceReport
  });

  return vaults.map((vault, index) => ({
    address: vault,
    supply: totalSupplies[index],
    priceChange: +((1 / priceConvertionsAfter[index][0]) - (1 / priceConvertionsBefore[index][0])) * 1e18,
    underlyingAsset: assets[index],
  }))
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const currentChainId = chainConfig[options.chain].chainId;

  const vaults = await getConfig('mellow', 'https://points.mellow.finance/v1/vaults');

  const coreMellowVaults = vaults.filter((vault: any) => vault.chain_id === currentChainId && vault.layer === "mellow").map((vault: any) => vault.address);
  const restakingVaults = vaults.filter((vault: any) => vault.chain_id === currentChainId && vault.layer !== "mellow").map((vault: any) => vault.address);

  const vaultInfosOld = await getERC4626VaultsInfo(options.fromApi, restakingVaults);
  const vaultInfosNew = await getERC4626VaultsInfo(options.toApi, restakingVaults);

  for (const [vault, vaultInfoOld] of Object.entries(vaultInfosOld)) {
    const vaultInfoNew = vaultInfosNew[vault]
    if (vaultInfoOld && vaultInfoNew) {
      const vaultRateIncrease = vaultInfoNew.assetsPerShare - vaultInfoOld.assetsPerShare
      dailyFees.add(vaultInfoOld.asset, vaultInfoOld.totalAssets * vaultRateIncrease / BigInt(1e18),METRIC.ASSETS_YIELDS);
      dailySupplySideRevenue.add(vaultInfoOld.asset, vaultInfoOld.totalAssets * vaultRateIncrease / BigInt(1e18), METRIC.ASSETS_YIELDS);
    }
  }

  const coreVaultsInfo = await getCoreVaultInfo(options, coreMellowVaults);

  if (coreVaultsInfo.length > 0) {
    coreVaultsInfo.forEach(({ supply, priceChange, underlyingAsset }: { supply: number, priceChange: number, underlyingAsset: string }) => {
      dailyFees.add(underlyingAsset, priceChange * supply, METRIC.ASSETS_YIELDS);
      dailySupplySideRevenue.add(underlyingAsset, priceChange * supply, METRIC.ASSETS_YIELDS);
    });

    const feePaidLogs = await options.getLogs({
      targets: coreVaultsInfo.map((vault: any) => vault.address),
      eventAbi: MellowAbis.reportHandledEvent
    });

    feePaidLogs.forEach(log => {
      const { asset, priceD18, fees } = log;
      dailyFees.add(asset, (1e18 / Number(priceD18)) * Number(fees));
      dailyRevenue.add(asset, (1e18 / Number(priceD18)) * Number(fees))
    })
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: chainConfig,
  fetch,
  methodology,
};

export default adapter;
