import * as sdk from "@defillama/sdk";
import { BaseAdapter, FetchOptions, IStartTimestamp, SimpleAdapter } from "../../adapters/types";
import { ABI, EulerConfigs, MorphoConfigs } from "./configs";

const METRICS = {
  // use this label for all yield sources if breakdownFees was not set
  AssetYields: 'Assets Yields',
  
  // set 
  OtherAssetYields: 'Other Asset Yields',
  OtherAssetYieldsToSuppliers: 'Other Asset Yields Distributed To Supliers',
  OtherAssetYieldsToCurator: 'Other Asset Yields To Curator',
  MorphoYields: 'Morpho Yields',
  MorphoYieldsToSuppliers: 'Morpho Yields Distributed To Supliers',
  MorphoPerformanceFee: 'Morpho Performance Fees',
  MorphoManagementFee: 'Morpho Performance Fees',
  EulerYields: 'Euler Yields',
  EulerYieldsToSuppliers: 'Euler Yields Distributed To Supliers',
  EulerPerformanceFee: 'Euler Performance Fees',
}

export interface CuratorConfig {
  methodology?: any;
  breakdownFees?: boolean;
  vaults: {
    // chain => 
    [key: string]: {
      start?: IStartTimestamp | number | string;
      morpho?: Array<string>;
      euler?: Array<string>;

      // initial owner of morpho vaults
      morphoVaultOwners?: Array<string>;
      morphoVaultV2Owners?: Array<string>;

      // creators of euler vaults
      eulerVaultOwners?: Array<string>;
    }
  }
}

interface Balances {
  dailyFees: sdk.Balances;
  dailyRevenue: sdk.Balances;
  dailySupplySideRevenue: sdk.Balances;
}

interface VaultERC4626Info {
  vault: string;
  asset: string;
  assetDecimals: number;
  balance: bigint;
  rateBefore: bigint;
  rateAfter: bigint;
}

function isOwner(owner: string, owners: Array<string>) {
  for (const item of owners) {
    if (String(item).toLowerCase() === String(owner).toLowerCase()) {
      return true
    }
  }
  return false
}

async function getMorphoVaults(options: FetchOptions, vaults: Array<string> | undefined, owners: Array<string> | undefined): Promise<Array<string>> {
  let morphoVaults = vaults ? vaults : []

  if (owners && owners.length > 0) {
    for (const factory of MorphoConfigs[options.chain].vaultFactories) {
      const logs = await options.getLogs({
        eventAbi: ABI.morpho.CreateMetaMorphoEvent,
        target: factory.address,
        fromBlock: factory.fromBlock,
        cacheInCloud: true,
      })
      const vaultOfOwners = logs.filter(log => isOwner(log.initialOwner, owners)).map((log) => log.metaMorpho)
      morphoVaults = morphoVaults.concat(vaultOfOwners)
    }
  }

  return morphoVaults
}

async function getMorphoVaultsV2(options: FetchOptions, owners: Array<string> | undefined): Promise<Array<string>> {
  let morphoVaults: Array<string> = []

  if (owners && owners.length > 0) {
    for (const factory of MorphoConfigs[options.chain].vaultV2Factories) {
      const logs = await options.getLogs({
        eventAbi: ABI.morpho.CreateVaultV2,
        target: factory.address,
        fromBlock: factory.fromBlock,
        cacheInCloud: true,
      })
      const vaultOfOwners = logs.filter(log => isOwner(log.owner, owners)).map((log) => log.newVaultV2)
      morphoVaults = morphoVaults.concat(vaultOfOwners)
    }
  }
  
  return morphoVaults
}

async function getEulerVaults(options: FetchOptions, vaults: Array<string> | undefined, owners: Array<string> | undefined): Promise<Array<string>> {
  let eulerVaults = vaults ? vaults : []

  const blacklistedVaults = EulerConfigs[options.chain] && EulerConfigs[options.chain].blacklistedVaults ? EulerConfigs[options.chain].blacklistedVaults : []

  if (owners && owners.length > 0) {
    for (const factory of EulerConfigs[options.chain].vaultFactories) {
      const getProxyListLength = await options.api.call({
        abi: ABI.euler.getProxyListLength,
        target: factory,
        permitFailure: true,
      });
      if (getProxyListLength) {
        const lists = []
        for (let i = 0; i < Number(getProxyListLength); i++) {
          lists.push(i);
        }
        const proxyAddresses = await options.api.multiCall({
          abi: ABI.euler.proxyList,
          calls: lists.map(index => {
            return {
              target: factory,
              params: [index],
            }
          }),
        })
        const proxyCreators = await options.api.multiCall({
          abi: ABI.euler.creator,
          calls: proxyAddresses,
        });
        for (let i = 0; i < proxyAddresses.length; i++) {
          if (isOwner(proxyCreators[i], owners)) {
            if (blacklistedVaults.includes(proxyAddresses[i].toLowerCase())) {
              continue
            }
            eulerVaults.push(proxyAddresses[i])
          }
        }
      }
    }
  }

  return eulerVaults
}

async function getVaultERC4626Info(options: FetchOptions, vaults: Array<string>, decimalAdjustment?: boolean): Promise<Array<VaultERC4626Info>> {
  const vaultInfo: Array<VaultERC4626Info> = []

  const assets = await options.fromApi.multiCall({
    abi: ABI.ERC4626.asset,
    calls: vaults,
    permitFailure: true,
  });
  const decimals = await options.fromApi.multiCall({
    abi: ABI.ERC4626.decimals,
    calls: assets.map(item => item ? item : ''),
    permitFailure: true,
  });
  const balances = await options.fromApi.multiCall({
    abi: ABI.ERC4626.totalAssets,
    calls: vaults,
    permitFailure: true,
  });
  const ratesBefore = await options.fromApi.multiCall({
    abi: ABI.ERC4626.converttoAssets,
    calls: vaults.map(vault => {
      return {
        target: vault,
        params: ['1000000000000000000'],
      }
    }),
    permitFailure: true,
  });
  const ratesAfter = await options.toApi.multiCall({
    abi: ABI.ERC4626.converttoAssets,
    calls: vaults.map(vault => {
      return {
        target: vault,
        params: ['1000000000000000000'],
      }
    }),
    permitFailure: true,
  });
  for (let i = 0; i < vaults.length; i++) {
    const asset = assets[i]
    if (asset) {
      const assetDecimals = Number(decimals[i]);
      const denominator = decimalAdjustment ? 10 ** (18 - assetDecimals) : 1;
      
      vaultInfo.push({
        vault: vaults[i],
        asset,
        assetDecimals: Number(decimals[i]),
        balance: BigInt(balances[i] ? balances[i] : 0),
        rateBefore: BigInt(ratesBefore[i] ? ratesBefore[i] : 0) * BigInt(denominator),
        rateAfter: BigInt(ratesAfter[i] ? ratesAfter[i] : 0) * BigInt(denominator),
      })
    }
  }

  return vaultInfo;
}

async function getMorphoVaultFee(options: FetchOptions, balances: Balances, vaults: Array<string>, breakdownFees?: boolean) {
  const vaultInfo = await getVaultERC4626Info(options, vaults, true)
  const vaultFeeRates = await options.api.multiCall({
    abi: ABI.morpho.fee,
    calls: vaultInfo.map(item => item.vault),
    permitFailure: true,
  })

  for (let i = 0; i < vaultInfo.length; i++) {
    const growthRate = vaultInfo[i].rateAfter - vaultInfo[i].rateBefore

    const vaultFeeRate = BigInt(vaultFeeRates[i] ? vaultFeeRates[i] : 0)

    // morpho vault include fee directly to vault shares
    // it mean that vault fees were added from vault token shares

    // interest earned and distributed to vault deposited including fees
    const interestEarnedIncludingFees = vaultInfo[i].balance * growthRate / BigInt(10**18)
    
    // interest earned by vault curator
    const interestFee = interestEarnedIncludingFees * vaultFeeRate / BigInt(1e18)

    if (breakdownFees) {
      balances.dailyFees.add(vaultInfo[i].asset, interestEarnedIncludingFees, METRICS.MorphoYields)
      balances.dailyRevenue.add(vaultInfo[i].asset, interestFee, METRICS.MorphoPerformanceFee)
      balances.dailySupplySideRevenue.add(vaultInfo[i].asset, interestEarnedIncludingFees- interestFee, METRICS.MorphoYieldsToSuppliers)
    } else {
      balances.dailyFees.add(vaultInfo[i].asset, interestEarnedIncludingFees, METRICS.AssetYields)
      balances.dailyRevenue.add(vaultInfo[i].asset, interestFee, METRICS.AssetYields)
      balances.dailySupplySideRevenue.add(vaultInfo[i].asset, interestEarnedIncludingFees- interestFee, METRICS.AssetYields)
    }
  }
}

export async function getEulerVaultFee(options: FetchOptions, balances: Balances, vaults: Array<string>, breakdownFees?: boolean) {
  const vaultInfo = await getVaultERC4626Info(options, vaults)
  const vaultFeeRates = await options.api.multiCall({
    abi: ABI.euler.interestFee,
    calls: vaultInfo.map(item => item.vault),
    permitFailure: true,
  })

  for (let i = 0; i < vaultInfo.length; i++) {
    const growthRate = vaultInfo[i].rateAfter - vaultInfo[i].rateBefore

    const vaultFeeRate = BigInt(vaultFeeRates[i] ? vaultFeeRates[i] : 0)

    // euler vault subtract fee directly from interest when collecting
    // it mean that vault fees were remove from vault token shares

    // interest earned and distributed to vault deposited after fees
    const interestEarned = vaultInfo[i].balance * growthRate / BigInt(1e18)
    
    // interest earned and distributed to vault deposited and vault curator before fees
    let interestEarnedBeforeFee = interestEarned
    if (vaultFeeRate < BigInt(1e4)) {
      interestEarnedBeforeFee = interestEarned * BigInt(1e4) / (BigInt(1e4) - vaultFeeRate)
    }

    // interest earned by vault curator
    const interestFee = interestEarnedBeforeFee - interestEarned

    if (breakdownFees) {
      balances.dailyFees.add(vaultInfo[i].asset, interestEarnedBeforeFee, METRICS.EulerYields)
      balances.dailyRevenue.add(vaultInfo[i].asset, interestFee, METRICS.EulerPerformanceFee)
      balances.dailySupplySideRevenue.add(vaultInfo[i].asset, interestEarnedBeforeFee - interestFee, METRICS.EulerYieldsToSuppliers)
    } else {
      balances.dailyFees.add(vaultInfo[i].asset, interestEarnedBeforeFee, METRICS.AssetYields)
      balances.dailyRevenue.add(vaultInfo[i].asset, interestFee, METRICS.AssetYields)
      balances.dailySupplySideRevenue.add(vaultInfo[i].asset, interestEarnedBeforeFee - interestFee, METRICS.AssetYields)
    }
  }
}

async function getMorphoVaultV2Fee(options: FetchOptions, balances: Balances, vaults: Array<string>, breakdownFees?: boolean) {
  const vaultInfo = await getVaultERC4626Info(options, vaults, true)
  const vaultPerformanceFeeRates = await options.api.multiCall({
    abi: ABI.morpho.performanceFee,
    calls: vaultInfo.map(item => item.vault),
    permitFailure: true,
  })
  const vaultManagementFeeRates = await options.api.multiCall({
    abi: ABI.morpho.managementFee,
    calls: vaultInfo.map(item => item.vault),
    permitFailure: true,
  })
  
  for (let i = 0; i < vaultInfo.length; i++) {
    const growthRate = vaultInfo[i].rateAfter - vaultInfo[i].rateBefore

    const vaultPerformanceFeeRate = BigInt(vaultPerformanceFeeRates[i] ? vaultPerformanceFeeRates[i] : 0)
    const vaultManagementFeeRate = BigInt(vaultManagementFeeRates[i] ? vaultManagementFeeRates[i] : 0)
    
    // morpho vault include fee directly to vault shares
    // it mean that vault fees were added from vault token shares

    // interest earned and distributed to vault deposited including fees
    const interestEarnedIncludingFees = vaultInfo[i].balance * growthRate / BigInt(10**18)
    
    // interest earned by vault curator - performance fee
    const interestPerformanceFee = interestEarnedIncludingFees * vaultPerformanceFeeRate / BigInt(1e18)
    
    // interest earned by vault curator - management fee
    const timeElapsed = options.toTimestamp - options.fromTimestamp
    const interestManagementFee = interestEarnedIncludingFees * vaultManagementFeeRate * BigInt(timeElapsed) / BigInt(1e18)

    if (breakdownFees) {
      balances.dailyFees.add(vaultInfo[i].asset, interestEarnedIncludingFees, METRICS.MorphoYields)
      balances.dailyRevenue.add(vaultInfo[i].asset, interestPerformanceFee, METRICS.MorphoManagementFee)
      balances.dailyRevenue.add(vaultInfo[i].asset, interestManagementFee, METRICS.MorphoManagementFee)
      balances.dailySupplySideRevenue.add(vaultInfo[i].asset, interestEarnedIncludingFees - interestPerformanceFee - interestManagementFee, METRICS.MorphoYieldsToSuppliers)
    } else {
      balances.dailyFees.add(vaultInfo[i].asset, interestEarnedIncludingFees, METRICS.AssetYields)
      balances.dailyRevenue.add(vaultInfo[i].asset, interestPerformanceFee, METRICS.AssetYields)
      balances.dailyRevenue.add(vaultInfo[i].asset, interestManagementFee, METRICS.AssetYields)
      balances.dailySupplySideRevenue.add(vaultInfo[i].asset, interestEarnedIncludingFees - interestPerformanceFee - interestManagementFee, METRICS.AssetYields)
    }
  }
}

export function getCuratorExport(curatorConfig: CuratorConfig): SimpleAdapter {
  const methodology = curatorConfig.methodology ? curatorConfig.methodology :  {
    Fees: 'Total yields from deposited assets in all curated vaults.',
    Revenue: 'Yields are collected by curators.',
    ProtocolRevenue: 'Yields are collected by curators.',
    SupplySideRevenue: 'Yields are distributed to vaults depositors/investors.',
  }
  const breakdownMethodology = {
    Fees: {
      [METRICS.AssetYields]: 'Interest yields generated from deposited assets in all curated vaults, including both curator fees and depositor yields',
      [METRICS.MorphoYields]: 'Interest yields generated from deposited assets in Morpho',
      [METRICS.EulerYields]: 'Interest yields generated from deposited assets in Euler',
    },
    Revenue: {
      [METRICS.AssetYields]: 'Portion of interest yields retained by vault curators as management and performance fees',
      [METRICS.MorphoPerformanceFee]: 'Performance fees charged from vaults in Moroho',
      [METRICS.MorphoManagementFee]: 'Management fees charged from vaults in Moroho',
    },
    SupplySideRevenue: {
      [METRICS.AssetYields]: 'Portion of interest yields distributed to vault depositors/investors after curator fees are deducted',
      [METRICS.MorphoYieldsToSuppliers]: 'Interest yields generated from deposited assets in Morpho distributed to suppliers',
      [METRICS.OtherAssetYieldsToSuppliers]: 'Interest yields generated from deposited assets in Euler distributed to suppliers',
    },
  }
  const exportObject: BaseAdapter = {}

  Object.entries(curatorConfig.vaults).map(([chain, vaults]) => {
    exportObject[chain] = {
      fetch: (async (options: FetchOptions) => {
        let dailyFees = options.createBalances()
        let dailyRevenue = options.createBalances()
        let dailySupplySideRevenue = options.createBalances()

        // morpho meta vaults
        const morphoVaults = await getMorphoVaults(options, vaults.morpho, vaults.morphoVaultOwners);

        // morpho v2 vaults
        const morphoVaultsV2 = await getMorphoVaultsV2(options, vaults.morphoVaultV2Owners);

        const eulerVaults = await getEulerVaults(options, vaults.euler, vaults.eulerVaultOwners);

        if (morphoVaults.length > 0) {
          await getMorphoVaultFee(options, { dailyFees, dailyRevenue, dailySupplySideRevenue }, morphoVaults, curatorConfig.breakdownFees)
        }
        if (morphoVaultsV2.length > 0) {
          await getMorphoVaultV2Fee(options, { dailyFees, dailyRevenue, dailySupplySideRevenue }, morphoVaultsV2, curatorConfig.breakdownFees)
        }
        if (eulerVaults.length > 0) {
          await getEulerVaultFee(options, { dailyFees, dailyRevenue, dailySupplySideRevenue }, eulerVaults, curatorConfig.breakdownFees)
        }

        return {
          dailyFees,
          dailyRevenue,
          dailyProtocolRevenue: dailyRevenue,
          dailySupplySideRevenue,
        }
      }),
      start: vaults.start,
    }
  })

  return {
    version: 2,
    methodology,
    breakdownMethodology,
    adapter: exportObject,
    allowNegativeValue: true, // we allow negative fees for vaults because vaults can make yields or make loss too
  }
}

