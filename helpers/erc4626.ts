import { FetchOptions } from "../adapters/types";
import { ChainApi } from "@defillama/sdk";

// helper for ERC4626-vaults
// https://docs.openzeppelin.com/contracts/4.x/erc4626

const ERC4626Abis: any = {
  asset: 'address:asset',
  decimals: 'uint8:decimals',
  totalAssets: 'uint256:totalAssets',
  assetsPerShare: 'function convertToAssets(uint256 shares) view returns (uint256 assets)',
}

interface ERC4626VaultInfo {
  asset: string;
  decimals: number;
  assetDecimals: number;
  totalAssets: bigint;
  assetsPerShare: bigint;
}

// return info of a list of ERC4626 vaults
export async function getERC4626VaultsInfo(usingApi: ChainApi, vaults: Array<string>): Promise<{
  // vault address => ERC4626VaultInfo | null
  [key: string]: ERC4626VaultInfo | null;
}> {
  const vaultInfos: {[key: string]: ERC4626VaultInfo| null} = {}

  const assets: Array<string> = await usingApi.multiCall({
    abi: ERC4626Abis.asset,
    permitFailure: true,
    calls: vaults,
  })
  const decimals: Array<string> = await usingApi.multiCall({
    abi: ERC4626Abis.decimals,
    permitFailure: true,
    calls: vaults,
  })
  const assetsDecimals: Array<string> = await usingApi.multiCall({
    abi: ERC4626Abis.decimals,
    permitFailure: true,
    calls: assets,
  })
  const totalAssets: Array<string> = await usingApi.multiCall({
    abi: ERC4626Abis.totalAssets,
    permitFailure: true,
    calls: vaults,
  })
  const assetsPerShares: Array<string> = await usingApi.multiCall({
    abi: ERC4626Abis.assetsPerShare,
    permitFailure: true,
    calls: vaults.map(vault => {
      return {
        target: vault,
        params: ['1000000000000000000'],
      }
    }),
  })

  for (let i = 0; i < vaults.length; i++) {
    const vault = vaults[i].toLowerCase()
    const asset = assets[i]

    if (asset) {
      vaultInfos[vault.toLowerCase()] = {
        asset: asset,
        decimals: Number(decimals[i]),
        assetDecimals: Number(assetsDecimals[i]),
        totalAssets: BigInt(totalAssets[i]),
        assetsPerShare: BigInt(assetsPerShares[i]),
      }
    } else {
      vaultInfos[vault] = null
    }
  }

  return vaultInfos
}

export async function getERC4626VaultsYield({
  options,
  vaults,
  assetAbi = 'address:asset',
  valueAbi = 'uint256:totalSupply',
  convertAbi = 'function convertToAssets(uint256) view returns (uint256)',
}: {
  options: FetchOptions,
  vaults: string[],
  assetAbi?: string,
  valueAbi?: string,
  convertAbi?: string,
}) {
  const assets = await options.api.multiCall({ abi: assetAbi, calls: vaults, permitFailure: true, })
  const values = await options.api.multiCall({ abi: valueAbi, calls: vaults, permitFailure: true, })
  const decimals = await options.api.multiCall({ abi: 'uint8:decimals', calls: vaults, permitFailure: true, })
  const convertCalls = vaults.map((vault, index) => {
    return {
      target: vault,
      params: [String(10 ** Number(decimals[index]))],
    }
  })
  const cumulativeIndexBefore = await options.fromApi.multiCall({ abi: convertAbi, calls: convertCalls, permitFailure: true, })
  const cumulativeIndexAfter = await options.toApi.multiCall({ abi: convertAbi, calls: convertCalls, permitFailure: true, })
  const balances = options.createBalances()

  for (let i = 0; i < assets.length; i++) {
    const token = assets[i]
    const value = values[i]
    const decimal = decimals[i]
    const cumulativeIndexBeforeValue = cumulativeIndexBefore[i]
    const cumulativeIndexAfterValue = cumulativeIndexAfter[i]
    if (token && value && decimal && cumulativeIndexBeforeValue && cumulativeIndexAfterValue) {
      const totalTokenBalance = Number(value)
      const growthCumulativeIndex = Number(cumulativeIndexAfterValue) - Number(cumulativeIndexBeforeValue)
      const growthInterest = growthCumulativeIndex * totalTokenBalance / (10 ** Number(decimal))
      balances.add(token, growthInterest)
    }
  }
  return balances
}