import * as sdk from "@defillama/sdk";
import { BaseAdapter, FetchOptions, IStartTimestamp } from "../adapters/types";

const ABI = {
  ERC4626: {
    asset: 'address:asset',
    converttoAssets: 'function convertToAssets(uint256 shares) view returns (uint256 assets)',
    totalAssets: 'uint256:totalAssets',
  },
  morpho: {
    fee: 'uint256:fee',
  },
  euler: {
    interestFee: 'uint256:interestFee',
  },
}

export interface CuratorConfig {
  methodology: any;

  vaults: {
    // chain => 
    [key: string]: {
      start?: IStartTimestamp | number | string;
      morpho?: Array<string>;
      euler?: Array<string>;
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
  balance: bigint;
  rateBefore: bigint;
  rateAfter: bigint;
}

async function getVaultERC4626Info(options: FetchOptions, vaults: Array<string>): Promise<Array<VaultERC4626Info>> {
  const vaultInfo: Array<VaultERC4626Info> = []

  const assets = await options.api.multiCall({
    abi: ABI.ERC4626.asset,
    calls: vaults,
  });
  const balances = await options.fromApi.multiCall({
    abi: ABI.ERC4626.totalAssets,
    calls: vaults,
  });
  const ratesBefore = await options.fromApi.multiCall({
    abi: ABI.ERC4626.converttoAssets,
    calls: vaults.map(vault => {
      return {
        target: vault,
        params: ['1000000000000000000'],
      }
    }),
  });
  const ratesAfter = await options.toApi.multiCall({
    abi: ABI.ERC4626.converttoAssets,
    calls: vaults.map(vault => {
      return {
        target: vault,
        params: ['1000000000000000000'],
      }
    }),
  });
  for (let i = 0; i < vaults.length; i++) {
    const asset = assets[i]
    if (asset) {
      vaultInfo.push({
        vault: vaults[i],
        asset,
        balance: BigInt(balances[i]),
        rateBefore: BigInt(ratesBefore[i]),
        rateAfter: BigInt(ratesAfter[i]),
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
  })

  for (let i = 0; i < vaultInfo.length; i++) {
    const growthRate = vaultInfo[i].rateAfter - vaultInfo[i].rateBefore

    if (growthRate > 0) {
      const vaultFeeRate = BigInt(vaultFeeRates[i])

      // morpho vault include fee directly to vault shares
      // it mean that vault fees were added from vault token shares

      // interest earned and distributed to vault deposited including fees
      const interestEarnedIncludingFees = vaultInfo[i].balance * growthRate / BigInt(1e18)
      
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
  })

  for (let i = 0; i < vaultInfo.length; i++) {
    const growthRate = vaultInfo[i].rateAfter - vaultInfo[i].rateBefore

    if (growthRate > 0) {
      const vaultFeeRate = BigInt(vaultFeeRates[i])

      // euler vault substract fee directly from interest when collecting
      // it mean that vault fees were remove from vault token shares

      // interest earned and distributed to vault deposited after fees
      const interestEarned = vaultInfo[i].balance * growthRate / BigInt(1e18)
      
      // interest earned and distributed to vault deposited and vault curator before fees
      const interestEarnedBeforeFee = interestEarned * BigInt(1e4) / (BigInt(1e4) - vaultFeeRate)

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

        if (vaults.morpho) {
          await getMorphoVaultFee(options, { dailyFees, dailyRevenue }, vaults.morpho)
        }
        if (vaults.euler) {
          await getEulerVaultFee(options, { dailyFees, dailyRevenue }, vaults.euler)
        }

        return {
          dailyFees,
          dailyRevenue,
        }
      }),
      start: vaults.start,
      meta: curatorConfig.methodology ? {
        methodology: curatorConfig.methodology,
      } : undefined,
    }
  })

  return exportObject
}
