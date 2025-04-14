import { ChainApi } from "@defillama/sdk";

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

// return info of given ERC4626 vault
export async function getERC4626VaultInfo(usingApi: ChainApi, vault: string): Promise<ERC4626VaultInfo | null> {
  const asset = await usingApi.call({
    abi: ERC4626Abis.asset,
    target: vault,
    permitFailure: true,
  })

  if (asset) {
    const decimals = await usingApi.call({
      abi: ERC4626Abis.decimals,
      target: vault,
    })
    const totalAssets = await usingApi.call({
      abi: ERC4626Abis.totalAssets,
      target: vault,
    })
    const assetsPerShare = await usingApi.call({
      abi: ERC4626Abis.assetsPerShare,
      target: vault,
      params: ['1000000000000000000']
    })
  
    return {
      asset: asset,
      assetDecimals: Number(decimals),
      totalAssets: BigInt(totalAssets),
      assetsPerShare: BigInt(assetsPerShare),
    }
  } else {
    return null;
  }
}