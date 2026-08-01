import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { getERC4626VaultsYield } from "../../helpers/erc4626"
import { METRIC } from "../../helpers/metrics"

const chainConfig: Record<string, {
  start: string
  yusd: string
  mintRedeem: { target: string, income?: boolean }[]
  vaults: { target: string, start?: string, instant?: boolean }[]
}> = {
  [CHAIN.ETHEREUM]: {
    start: "2025-01-23",
    yusd: "0x4274cD7277C7bb0806Bd5FE84b9aDAE466a8DA0a",
    mintRedeem: [
      { target: "0xA30644CA67E0A93805c443Df4A6E1856d8Bd815B", income: true },
      { target: "0xC4dF68e592245ca5202FE8b7C438D2b799820fc2", income: true },
    ],
    vaults: [
      { target: "0xfE0ccc9942E98C963Fe6b4e5194EB6e3Baa4cb64", start: "2025-07-30", instant: true },
    ],
  },
  [CHAIN.BSC]: {
    start: "2025-03-31",
    yusd: "0xAB3dBcD9B096C3fF76275038bf58eAC10D22C61f",
    mintRedeem: [
      { target: "0x39dF2D423df0BDDBA28f23C15c65a86554A2e141", income: true },
    ],
    vaults: [
      { target: "0x24DB057b19241eeFB9B522e8627C293Ed8f93Af2", start: "2025-07-30" },
    ],
  },
}

const abi = {
  depositIncome: "event DepositIncome(string snapshotId, address indexed manager, address collateralAsset, uint256 collateralAmount, uint256 yusdAmount, uint256 fee, uint256 timestamp)",
  mint: "event Mint(address indexed userWallet, address collateralAsset, uint256 collateralAmount, uint256 yusdAmount, uint256 fee)",
  redeem: "event ApproveRedeemRequest(string requestId, address indexed manager, address indexed userWallet, address collateralAsset, uint256 collateralAmount, uint256 yusdAmount, uint256 fee)",
  instantUnstaking: "event InstantUnstaking(address indexed user, address indexed receiver, uint256 assets, uint256 fee)",
}

const METRICS = {
  yusdHoldersYield: "YUSD Holder Yield",
  yusdInsuranceYield: "YUSD Insurance Yield",
  yusdMintRedeem: "YUSD Mint/Redeem Fees",
  syusdStakersYield: "sYUSD Staker Yield",
  syusdInstantUnstaking: "sYUSD Unstaking Fees",
}

const fetch = async (options: FetchOptions) => {
  const config = chainConfig[options.chain]
  const dailyFees = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  const dailyUserFees = options.createBalances()
  const mintRedeemTargets = config.mintRedeem.map(({ target }) => target)
  const incomeTargets = config.mintRedeem.filter(({ income }) => income).map(({ target }) => target)
  const activeVaults = config.vaults.filter(({ start }) => !start || options.dateString >= start)
  const vaultTargets = activeVaults.map(({ target }) => target)

  const [incomeLogs, mintLogs, redeemLogs] = await Promise.all([
    options.getLogs({ targets: incomeTargets, eventAbi: abi.depositIncome }),
    options.getLogs({ targets: mintRedeemTargets, eventAbi: abi.mint }),
    options.getLogs({ targets: mintRedeemTargets, eventAbi: abi.redeem }),
  ])

  incomeLogs.forEach((log: any) => {
    dailyFees.add(config.yusd, log.yusdAmount + log.fee, METRIC.ASSETS_YIELDS)
    dailySupplySideRevenue.add(config.yusd, log.yusdAmount, METRICS.yusdHoldersYield)
    dailySupplySideRevenue.add(config.yusd, log.fee, METRICS.yusdInsuranceYield)
  })

  mintLogs.concat(redeemLogs).forEach((log: any) => {
    dailyFees.add(config.yusd, log.fee, METRIC.MINT_REDEEM_FEES)
    dailyUserFees.add(config.yusd, log.fee, METRIC.MINT_REDEEM_FEES)
    dailySupplySideRevenue.add(config.yusd, log.fee, METRICS.yusdMintRedeem)
  })

  const instantTargets = activeVaults.filter(({ instant }) => instant).map(({ target }) => target)

  const vaultYield = await getERC4626VaultsYield({ options, vaults: vaultTargets });
  dailyFees.addBalances(vaultYield, METRIC.ASSETS_YIELDS)
  dailySupplySideRevenue.addBalances(vaultYield, METRICS.syusdStakersYield)

  if(instantTargets.length > 0){
    const instantLogs = await options.getLogs({ targets: instantTargets, eventAbi: abi.instantUnstaking });
    instantLogs.forEach((log: any) => {
      dailyFees.add(config.yusd, log.fee, METRIC.DEPOSIT_WITHDRAW_FEES)
      dailyUserFees.add(config.yusd, log.fee, METRIC.DEPOSIT_WITHDRAW_FEES)
      dailySupplySideRevenue.add(config.yusd, log.fee, METRICS.syusdInstantUnstaking)
    })
  }

  return { dailyFees, dailyRevenue: 0, dailySupplySideRevenue, dailyUserFees }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  allowNegativeValue: true,
  adapter: chainConfig,
  fetch,
  methodology: {
    Fees: "YUSD holder yield, sYUSD vault yield, YUSD mint and redeem fees, and sYUSD instant unstaking fees.",
    Revenue: "No protocol revenue is counted.",
    SupplySideRevenue: "YUSD holder rewards, YUSD fees kept in the insurance fund, and yield earned by sYUSD stakers.",
    UserFees: "YUSD mint, redeem, and sYUSD instant unstaking fees paid by users.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.ASSETS_YIELDS]: "Yield earned by YUSD holders and sYUSD stakers.",
      [METRIC.MINT_REDEEM_FEES]: "Fees charged when users mint or redeem YUSD.",
      [METRIC.DEPOSIT_WITHDRAW_FEES]: "Fees charged when users instant-unstake sYUSD.",
    },
    SupplySideRevenue: {
      [METRICS.yusdHoldersYield]: "YUSD rewards distributed to YUSD holders.",
      [METRICS.yusdInsuranceYield]: "YUSD yield kept in the insurance fund.",
      [METRICS.yusdMintRedeem]: "YUSD mint and redeem fees kept in the insurance fund.",
      [METRICS.syusdStakersYield]: "Yield earned by sYUSD stakers.",
      [METRICS.syusdInstantUnstaking]: "sYUSD instant unstaking fees kept in the insurance fund.",
    },
  },
}

export default adapter
