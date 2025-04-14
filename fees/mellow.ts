//  Maverick v1 fee
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { ChainApi } from "@defillama/sdk";
import { httpGet } from "../utils/fetchURL";
import { getERC4626VaultInfo } from "../helpers/erc4626";

const methodology = {
  Fees: "Fees generated from staking assets in LRT vaults.",
};

const MellowAbis: any = {
  configurator: 'address:configurator',
  priceOracle: 'address:priceOracle',
  baseTokens: 'function baseTokens(address) view returns (address)',
  underlyingTvl: 'function underlyingTvl() view returns (address[] tokens, uint256[] amounts)',
  getPrice: 'function getPrice(address, address) view returns (uint256 answer, uint8 decimals)',
  totalSupply: 'uint256:totalSupply',
  decimals: 'uint8:decimals',
}

// get active vaults from Mellow API
// https://points.mellow.finance/v1/vaults
const DVstETHVault = '0x5E362eb2c0706Bd1d134689eC75176018385430B'
const DVstETHPriceOracle = '0x39D5F9aEbBEcba99ED5d707b11d790387B5acB63'
async function getActiveVaults(): Promise<Array<string>> {
  return ((await httpGet('https://points.mellow.finance/v1/vaults')).map((item: any) => item.address) as Array<string>)
  .filter((vault: string) => String(vault).toLowerCase() !== String(DVstETHVault).toLowerCase())
}

async function getVaultInfo(usingApi: ChainApi, vault: string, priceOracle: string): Promise<{
  totalBaseTokenDeposited: number
  totalVaultSupply: number;
}> {
  let totalBaseTokenDeposited = 0;

  const [tokens, amounts]: any = await usingApi.call({
    abi: MellowAbis.underlyingTvl,
    target: vault,
  })
  for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex++) {
    const token = tokens[tokenIndex]
    const balance = amounts[tokenIndex]

    const {answer, decimals} = await usingApi.call({
      abi: MellowAbis.getPrice,
      target: priceOracle,
      params: [vault, token]
    })

    totalBaseTokenDeposited += Number(balance) * Number(answer) / 1e18
  }

  const totalSupply: bigint = await usingApi.call({
    abi: MellowAbis.totalSupply,
    target: vault,
  })

  return {
    totalBaseTokenDeposited,
    totalVaultSupply: Number(totalSupply),
  }
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances()

  // DVstETHVault
  const DVstETHVaultInfoOld = await getVaultInfo(options.fromApi, DVstETHVault, DVstETHPriceOracle)
  const DVstETHVaultInfoNew = await getVaultInfo(options.toApi, DVstETHVault, DVstETHPriceOracle)

  const lrtRateOld = DVstETHVaultInfoOld.totalBaseTokenDeposited / DVstETHVaultInfoOld.totalVaultSupply
  const lrtRateNew = DVstETHVaultInfoNew.totalBaseTokenDeposited / DVstETHVaultInfoNew.totalVaultSupply
  const lrtRateIncrease = lrtRateNew - lrtRateOld

  // token ETH
  dailyFees.addGasToken(DVstETHVaultInfoOld.totalBaseTokenDeposited * lrtRateIncrease)

  const vaults = await getActiveVaults()
  for (const vault of vaults) {
    const vaultInfoOld = await getERC4626VaultInfo(options.fromApi, vault)
    if (vaultInfoOld) {
      const vaultInfoNew = await getERC4626VaultInfo(options.toApi, vault)
      if (vaultInfoNew) {
        const vaultRateIncrease = vaultInfoNew.assetsPerShare - vaultInfoOld.assetsPerShare
        dailyFees.add(vaultInfoOld.asset, Number(vaultInfoOld.totalAssets * vaultRateIncrease / BigInt(1e18)))
      }
    }
  }
  return {
    dailyFees,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;
