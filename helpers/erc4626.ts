import { FetchOptions } from "../adapters/types";

export async function getERC4626VaultsYield({
  options,
  vaults,
  assetAbi = 'address:asset',
  valueAbi = 'uint256:totalAssets',
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
      const totalTokenBalance = Number(value) / (10 ** Number(decimal))
      const growthCumulativeIndex = Number(cumulativeIndexAfterValue) - Number(cumulativeIndexBeforeValue)
      const growthInterest = growthCumulativeIndex * totalTokenBalance / (10 ** Number(decimal))
      balances.add(token, growthInterest)
    }
  }
  return balances
}