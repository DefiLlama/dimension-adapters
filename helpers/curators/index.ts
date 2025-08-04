import * as sdk from "@defillama/sdk";
import { BaseAdapter, FetchOptions, IStartTimestamp, SimpleAdapter } from "../../adapters/types";
import { ABI, EulerConfigs, MorphoConfigs } from "./configs";

export interface CuratorConfig {
  methodology?: any;

  vaults: {
    // chain => 
    [key: string]: {
      start?: IStartTimestamp | number | string;
      morpho?: Array<string>;
      euler?: Array<string>;

      // initial owner of morpho vaults
      morphoVaultOwners?: Array<string>;

      // creators of euler vaults
      eulerVaultOwners?: Array<string>;
    }
  }
}

interface Balances {
  dailyFees: sdk.Balances,
  dailyRevenue: sdk.Balances,
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
        skipCache: true,
        fromBlock: factory.fromBlock,
        toBlock: options.toApi.block ? Number(options.toApi.block) : undefined,
      })
      const vaultOfOwners =logs.filter(log => isOwner(log.initialOwner, owners)).map((log) => log.metaMorpho)
      morphoVaults = morphoVaults.concat(vaultOfOwners)
    }
  }

  return morphoVaults
}

async function getEulerVaults(options: FetchOptions, vaults: Array<string> | undefined, owners: Array<string> | undefined): Promise<Array<string>> {
  let eulerVaults = vaults ? vaults : []

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
            eulerVaults.push(proxyAddresses[i])
          }
        }
      }
    }
  }

  return eulerVaults
}

async function getVaultERC4626Info(options: FetchOptions, vaults: Array<string>): Promise<Array<VaultERC4626Info>> {
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
      vaultInfo.push({
        vault: vaults[i],
        asset,
        assetDecimals: Number(decimals[i]),
        balance: BigInt(balances[i] ? balances[i] : 0),
        rateBefore: BigInt(ratesBefore[i] ? ratesBefore[i] : 0),
        rateAfter: BigInt(ratesAfter[i] ? ratesAfter[i] : 0),
      })
    }
  }

  return vaultInfo;
}

async function getMorphoVaultFee(options: FetchOptions, balances: Balances, vaults: Array<string>) {
  const vaultInfo = await getVaultERC4626Info(options, vaults)
  const vaultFeeRates = await options.api.multiCall({
    abi: ABI.morpho.fee,
    calls: vaultInfo.map(item => item.vault),
    permitFailure: true,
  })

  for (let i = 0; i < vaultInfo.length; i++) {
    const growthRate = vaultInfo[i].rateAfter - vaultInfo[i].rateBefore

    if (growthRate > 0) {
      const vaultFeeRate = BigInt(vaultFeeRates[i] ? vaultFeeRates[i] : 0)

      // morpho vault include fee directly to vault shares
      // it mean that vault fees were added from vault token shares

      // interest earned and distributed to vault deposited including fees
      const interestEarnedIncludingFees = vaultInfo[i].balance * growthRate / BigInt(10**vaultInfo[i].assetDecimals)
      
      // interest earned by vault curator
      const interestFee = interestEarnedIncludingFees * vaultFeeRate / BigInt(1e18)

      balances.dailyFees.add(vaultInfo[i].asset, interestEarnedIncludingFees)
      balances.dailyRevenue.add(vaultInfo[i].asset, interestFee)
    }
  }
}

async function getEulerVaultFee(options: FetchOptions, balances: Balances, vaults: Array<string>) {
  const vaultInfo = await getVaultERC4626Info(options, vaults)
  const vaultFeeRates = await options.api.multiCall({
    abi: ABI.euler.interestFee,
    calls: vaultInfo.map(item => item.vault),
    permitFailure: true,
  })

  for (let i = 0; i < vaultInfo.length; i++) {
    const growthRate = vaultInfo[i].rateAfter - vaultInfo[i].rateBefore

    if (growthRate > 0) {
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

      balances.dailyFees.add(vaultInfo[i].asset, interestEarnedBeforeFee)
      balances.dailyRevenue.add(vaultInfo[i].asset, interestFee)
    }
  }
}

export function getCuratorExport(curatorConfig: CuratorConfig): BaseAdapter {
  const exportObject: BaseAdapter = {}

  Object.entries(curatorConfig.vaults).map(([chain, vaults]) => {
    exportObject[chain] = {
      fetch: (async (options: FetchOptions) => {
        let dailyFees = options.createBalances()
        let dailyRevenue = options.createBalances()

        const morphoVaults = await getMorphoVaults(options, vaults.morpho, vaults.morphoVaultOwners);
        const eulerVaults = await getEulerVaults(options, vaults.euler, vaults.eulerVaultOwners);
        if (morphoVaults.length > 0) {
          await getMorphoVaultFee(options, { dailyFees, dailyRevenue }, morphoVaults)
        }
        if (eulerVaults.length > 0) {
          await getEulerVaultFee(options, { dailyFees, dailyRevenue }, eulerVaults)
        }

        const dailySupplySideRevenue = dailyFees.clone()
        dailySupplySideRevenue.subtract(dailyRevenue)

        return {
          dailyFees,
          dailyRevenue,
          dailyProtocolRevenue: dailyRevenue,
          dailySupplySideRevenue,
        }
      }),
      start: vaults.start,
      meta: curatorConfig.methodology ? {
        methodology: curatorConfig.methodology,
      } : {
        methodology: {
          Fees: 'Total yields from deposited assets in all curated vaults.',
          Revenue: 'Yields are collected by curators.',
          ProtocolRevenue: 'Yields are collected by curators.',
          SupplySideRevenue: 'Yields are distributed to vaults depositors/investors.',
        }
      },
    }
  })

  return exportObject
}
