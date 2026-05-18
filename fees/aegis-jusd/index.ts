import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { getERC4626VaultsYield } from "../../helpers/erc4626"
import { METRIC } from "../../helpers/metrics"

const chainConfig: Record<string, {
  start: string
  mintRedeem: { target: string }[]
  vaults: { target: string, start?: string, instant?: boolean }[]
}> = {
  [CHAIN.ETHEREUM]: {
    start: "2025-01-23",
    mintRedeem: [
      { target: "0xBB0F32D176590faEdC7bc552b7EAD7A86809b520" },
    ],
    vaults: [
      { target: "0x4AA8949bb47da4b4F27345404Ba1e5E7EA90bdb3", start: "2026-02-06", instant: true },
    ],
  },
}

const abi = {
  mint: "event Mint(address indexed userWallet, address collateralAsset, uint256 collateralAmount, uint256 yusdAmount, uint256 fee)",
  redeem: "event ApproveRedeemRequest(string requestId, address indexed manager, address indexed userWallet, address collateralAsset, uint256 collateralAmount, uint256 yusdAmount, uint256 fee)",
  instantUnstaking: "event InstantUnstaking(address indexed user, address indexed receiver, uint256 assets, uint256 fee)",
}

const METRICS = {
  jusdMintRedeem: "JUSD Mint/Redeem Fees",
  sjusdStakersYield: "sJUSD Staker Yield",
  sjusdInstantUnstaking: "sJUSD Unstaking Fees",
}

const fetch = async (options: FetchOptions) => {
  const config = chainConfig[options.chain]
  const dailyFees = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  const dailyUserFees = options.createBalances()
  const mintRedeemTargets = config.mintRedeem.map(({ target }) => target)
  const activeVaults = config.vaults.filter(({ start }) => !start || options.dateString >= start)
  const vaultTargets = activeVaults.map(({ target }) => target)

  const [mintLogs, redeemLogs] = await Promise.all([
    options.getLogs({ targets: mintRedeemTargets, eventAbi: abi.mint }),
    options.getLogs({ targets: mintRedeemTargets, eventAbi: abi.redeem }),
  ])

  mintLogs.concat(redeemLogs).forEach((log: any) => {
    const feeUsd = Number(log.fee) / 1e18
    dailyFees.addUSDValue(feeUsd, METRIC.MINT_REDEEM_FEES)
    dailyUserFees.addUSDValue(feeUsd, METRIC.MINT_REDEEM_FEES)
    dailySupplySideRevenue.addUSDValue(feeUsd, METRICS.jusdMintRedeem)
  })

  const instantTargets = activeVaults.filter(({ instant }) => instant).map(({ target }) => target)
  const [vaultYield, instantLogs, vaultAssets] = await Promise.all([
    getERC4626VaultsYield({ options, vaults: vaultTargets }),
    options.getLogs({ targets: instantTargets, eventAbi: abi.instantUnstaking }),
    options.api.multiCall({ abi: "address:asset", calls: vaultTargets, permitFailure: true }),
  ])
  const assetDecimals = await options.api.multiCall({
    abi: "uint8:decimals",
    calls: vaultAssets.filter(Boolean),
    permitFailure: true,
  })
  const decimalsByAsset = Object.fromEntries(
    vaultAssets
      .map((asset, i) => asset ? [asset.toLowerCase(), Number(assetDecimals[i])] : null)
      .filter(Boolean) as [string, number][]
  )
  const vaultYieldUsd = Object.entries(vaultYield.getBalances()).reduce<number>(
    (sum, [asset, value]) => sum + Number(value) / 10 ** (decimalsByAsset[asset.toLowerCase()] ?? 18),
    0,
  )
    dailyFees.addUSDValue(vaultYieldUsd, METRIC.ASSETS_YIELDS)
    dailySupplySideRevenue.addUSDValue(vaultYieldUsd, METRICS.sjusdStakersYield)

  instantLogs.forEach((log: any) => {
    const feeUsd = Number(log.fee) / 1e18
    dailyFees.addUSDValue(feeUsd, METRIC.DEPOSIT_WITHDRAW_FEES)
    dailyUserFees.addUSDValue(feeUsd, METRIC.DEPOSIT_WITHDRAW_FEES)
    dailySupplySideRevenue.addUSDValue(feeUsd, METRICS.sjusdInstantUnstaking)
  })

  return { dailyFees, dailyRevenue: 0, dailySupplySideRevenue, dailyUserFees }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: chainConfig,
  allowNegativeValue: true,
  fetch,
  methodology: {
    Fees: "sJUSD vault yield, JUSD mint and redeem fees, and sJUSD instant unstaking fees, all treated as USD-denominated stablecoin flows.",
    Revenue: "No protocol revenue is counted.",
    SupplySideRevenue: "JUSD fees kept in the insurance fund and yield earned by sJUSD stakers.",
    UserFees: "JUSD mint, redeem, and sJUSD instant unstaking fees paid by users.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.ASSETS_YIELDS]: "Yield earned by sJUSD stakers, counted at face-value USD.",
      [METRIC.MINT_REDEEM_FEES]: "Fees charged when users mint or redeem JUSD, counted at face-value USD.",
      [METRIC.DEPOSIT_WITHDRAW_FEES]: "Fees charged when users instant-unstake sJUSD, counted at face-value USD.",
    },
    SupplySideRevenue: {
      [METRICS.jusdMintRedeem]: "JUSD mint and redeem fees kept in the insurance fund, counted at face-value USD.",
      [METRICS.sjusdStakersYield]: "Yield earned by sJUSD stakers, counted at face-value USD.",
      [METRICS.sjusdInstantUnstaking]: "sJUSD instant unstaking fees kept in the insurance fund, counted at face-value USD.",
    },
  },
}

export default adapter
