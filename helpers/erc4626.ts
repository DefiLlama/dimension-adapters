import { ChainApi } from "@defillama/sdk";
import { normalizeAddress } from "@defillama/sdk/build/util";

// helper for ERC4626-vaults
// https://docs.openzeppelin.com/contracts/4.x/erc4626

const ERC4626Abis: any = {
  asset: 'address:asset',
  decimals: 'uint8:decimals',
  totalAssets: 'uint256:totalSupply',
  assetsPerShare: 'function convertToAssets(uint256 shares) view returns (uint256 assets)',
}

interface ERC4626VaultInfo {
  asset: string;
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
        assetDecimals: Number(decimals[i]),
        totalAssets: BigInt(totalAssets[i]),
        assetsPerShare: BigInt(assetsPerShares[i]),
      }
    } else {
      vaultInfos[vault] = null
    }
  }

  return vaultInfos
}