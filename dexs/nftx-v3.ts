import { FetchOptions, SimpleAdapter } from "../adapters/types";
import ADDRESSES from "../helpers/coreAssets.json";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";

interface ChainSettings {
  start: string;
  vaultFactory: string;
  ammFactory: string;
  fromBlock: number;
  feeDistributors: string[];
  treasury: string;
  weth: string;
}

const chainConfig: Record<string, ChainSettings> = {
  [CHAIN.ETHEREUM]: {
    start: '2023-12-13',
    vaultFactory: '0xC255335bc5aBd6928063F5788a5E420554858f01',
    ammFactory: '0xa70e10beB02fF9a44007D9D3695d4b96003db101',
    fromBlock: 18779103,
    feeDistributors: [
      '0xF4d96C5094FCD9eC24E612585e723b58F89e21fe', // until block 19391825 (2024-03-08)
      '0x6845fF5f102bEF9D785468F0bEb535b4687406E7',
    ],
    treasury: '0x40D73Df4F99bae688CE3C23a01022224FE16C7b2',
    weth: ADDRESSES.ethereum.WETH,
  },
  [CHAIN.ARBITRUM]: {
    start: '2024-03-20',
    vaultFactory: '0x4dEeb9D2Bff2e9C35ce1f013DcC4582F891cb711',
    ammFactory: '0xF4D0512FB47319B0CE9144EF582862e2921CaBF8',
    fromBlock: 192368147,
    feeDistributors: ['0x0d50970C7848ebbE52661e70057D7D063B7de886'],
    treasury: '0x3863A65CE278a240f9Aa2A4b4A48493bE59E6139',
    weth: ADDRESSES.arbitrum.WETH,
  },
}

const newVaultEvent = 'event NewVault(uint256 indexed vaultId, address vaultAddress, address assetAddress, string name, string symbol)'
const poolCreatedEvent = 'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)'
const swapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)'

const LABELS = {
  VAULT_FEES: 'Vault Fees',
  PREMIUM_FEES: 'NFT Premium Fees',
  SWAP_FEES: 'AMM Swap Fees',
  VAULT_FEES_TO_LPS: 'Vault Fees To Liquidity Providers',
  VAULT_FEES_TO_INVENTORY: 'Vault Fees To Inventory Stakers',
  VAULT_FEES_TO_TREASURY: 'Vault Fees To Treasury',
  PREMIUM_FEES_TO_DEPOSITORS: 'NFT Premium Fees To Depositors',
  SWAP_FEES_TO_LPS: 'AMM Swap Fees To Liquidity Providers',
}

const fetch = async (options: FetchOptions) => {
  const { vaultFactory, ammFactory, fromBlock, feeDistributors, treasury, weth } = chainConfig[options.chain]
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const vaultLogs = await options.getLogs({ target: vaultFactory, eventAbi: newVaultEvent, fromBlock, cacheInCloud: true })
  const vaults: string[] = vaultLogs.map((log: any) => log.vaultAddress)

  const vaultFees = await addTokensReceived({ options, targets: feeDistributors, token: weth })
  dailyFees.addBalances(vaultFees, LABELS.VAULT_FEES)

  const toPools = await options.getLogs({ targets: feeDistributors, eventAbi: 'event WethDistributedToPool(uint256 vaultId, uint256 amount)' })
  toPools.forEach((log: any) => dailySupplySideRevenue.add(weth, log.amount, LABELS.VAULT_FEES_TO_LPS))
  const toInventory = await options.getLogs({ targets: feeDistributors, eventAbi: 'event WethDistributedToInventory(uint256 vaultId, uint256 amount)' })
  toInventory.forEach((log: any) => dailySupplySideRevenue.add(weth, log.amount, LABELS.VAULT_FEES_TO_INVENTORY))
  const toTreasury = await addTokensReceived({ options, target: treasury, token: weth, fromAdddesses: feeDistributors })
  dailyRevenue.addBalances(toTreasury, LABELS.VAULT_FEES_TO_TREASURY)

  const premiums = await options.getLogs({ targets: vaults, eventAbi: 'event PremiumShared(address depositor, uint256 wethPremium)' })
  premiums.forEach((log: any) => {
    dailyFees.add(weth, log.wethPremium, LABELS.PREMIUM_FEES)
    dailySupplySideRevenue.add(weth, log.wethPremium, LABELS.PREMIUM_FEES_TO_DEPOSITORS)
  })

  const vTokens = new Set(vaults.map(v => v.toLowerCase()))
  const poolLogs = await options.getLogs({ target: ammFactory, eventAbi: poolCreatedEvent, fromBlock, cacheInCloud: true })
  const pools = poolLogs.filter((p: any) => {
    const [token0, token1] = [p.token0.toLowerCase(), p.token1.toLowerCase()]
    return (token0 === weth && vTokens.has(token1)) || (token1 === weth && vTokens.has(token0))
  })
  if (pools.length) {
    const swapLogs = await options.getLogs({ targets: pools.map((p: any) => p.pool), eventAbi: swapEvent, flatten: false })
    swapLogs.forEach((logs: any[], i: number) => {
      const { token0, fee } = pools[i]
      const isWeth0 = token0.toLowerCase() === weth
      logs.forEach((log: any) => {
        let wethAmount = BigInt(isWeth0 ? log.amount0 : log.amount1)
        if (wethAmount < 0n) wethAmount = -wethAmount
        dailyVolume.add(weth, wethAmount)
        const swapFee = wethAmount * BigInt(fee) / 1_000_000n
        dailyFees.add(weth, swapFee, LABELS.SWAP_FEES)
        dailySupplySideRevenue.add(weth, swapFee, LABELS.SWAP_FEES_TO_LPS)
      })
    })
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailyHoldersRevenue: 0,
  }
}

const methodology = {
  Volume: "WETH side of swaps on the NFTX AMM's vToken/WETH pools, which include NFT buys and sells routed through NFTX. Pools on the AMM that pair WETH with tokens other than NFTX vTokens are excluded. Trading of NFTX V2 vTokens on Sushiswap pools is excluded and attributed to Sushiswap.",
  Fees: "Vault fees paid in ETH to mint, redeem or swap NFTs, premium fees paid to redeem recently deposited NFTs, and swap fees on the NFTX AMM's vToken/WETH pools. Excludes early-withdrawal penalties, which are paid in vTokens, and the optional creator royalties paid through the NFTX marketplace zap.",
  Revenue: "Vault fees that go to the NFTX treasury because the vault had no LPs or inventory stakers to receive them.",
  ProtocolRevenue: "Vault fees that go to the NFTX treasury.",
  SupplySideRevenue: "80% of vault fees to the vToken's 0.3% pool LPs and 20% to inventory stakers, 90% of premium fees to the NFT's depositor, and all AMM swap fees to LPs.",
  HoldersRevenue: "NFTX V3 pays nothing to token holders.",
}

const breakdownMethodology = {
  Fees: {
    [LABELS.VAULT_FEES]: "Fees paid in ETH to mint, redeem or swap NFTs in an NFTX vault, plus 10% of premium fees.",
    [LABELS.PREMIUM_FEES]: "The 90% of premium fees passed to the NFT's depositor. A premium starts at 5x one vToken and decays to zero over the 10 hours after an NFT is deposited.",
    [LABELS.SWAP_FEES]: "Swap fees on the NFTX AMM's vToken/WETH pools (0.3% or 1% fee tiers).",
  },
  Revenue: {
    [LABELS.VAULT_FEES_TO_TREASURY]: "Vault fees sent to the NFTX treasury when the vault had no LPs or inventory stakers to receive them.",
  },
  ProtocolRevenue: {
    [LABELS.VAULT_FEES_TO_TREASURY]: "Vault fees sent to the NFTX treasury when the vault had no LPs or inventory stakers to receive them.",
  },
  SupplySideRevenue: {
    [LABELS.VAULT_FEES_TO_LPS]: "80% of vault fees, paid to LPs of the vToken's 0.3% pool.",
    [LABELS.VAULT_FEES_TO_INVENTORY]: "20% of vault fees, paid to inventory stakers.",
    [LABELS.PREMIUM_FEES_TO_DEPOSITORS]: "90% of premium fees, paid to the address that deposited the redeemed NFT.",
    [LABELS.SWAP_FEES_TO_LPS]: "All NFTX AMM swap fees, paid to the pool's LPs (the AMM protocol fee is off).",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
}

export default adapter
