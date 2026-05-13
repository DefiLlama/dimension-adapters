import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { METRIC } from "../../helpers/metrics"

const WAD = 10n ** 18n

const chainConfig: any = {
  [CHAIN.ETHEREUM]: {
    start: "2025-01-23",
    yusd: "0x4274cD7277C7bb0806Bd5FE84b9aDAE466a8DA0a",
    jusd: "0xc86168d2424d28942EE0866F043c1206bc9E4900",
    mintRedeem: [
      { product: "yusd", target: "0xA30644CA67E0A93805c443Df4A6E1856d8Bd815B", income: true },
      { product: "yusd", target: "0xC4dF68e592245ca5202FE8b7C438D2b799820fc2", income: true },
      { product: "jusd", target: "0xBB0F32D176590faEdC7bc552b7EAD7A86809b520" },
    ],
    vaults: [
      { product: "syusd", target: "0xfE0ccc9942E98C963Fe6b4e5194EB6e3Baa4cb64", start: "2025-07-30", instant: true },
      { product: "sjusd", target: "0x4AA8949bb47da4b4F27345404Ba1e5E7EA90bdb3", start: "2026-02-06", instant: true },
    ],
  },
  [CHAIN.BSC]: {
    start: "2025-03-31",
    yusd: "0xAB3dBcD9B096C3fF76275038bf58eAC10D22C61f",
    mintRedeem: [
      { product: "yusd", target: "0x39dF2D423df0BDDBA28f23C15c65a86554A2e141", income: true },
    ],
    vaults: [
      { product: "syusd", target: "0x24DB057b19241eeFB9B522e8627C293Ed8f93Af2", start: "2025-07-30" },
    ],
  },
}

const abi = {
  depositIncome: "event DepositIncome(string snapshotId, address indexed manager, address collateralAsset, uint256 collateralAmount, uint256 yusdAmount, uint256 fee, uint256 timestamp)",
  mint: "event Mint(address indexed userWallet, address collateralAsset, uint256 collateralAmount, uint256 yusdAmount, uint256 fee)",
  redeem: "event ApproveRedeemRequest(string requestId, address indexed manager, address indexed userWallet, address collateralAsset, uint256 collateralAmount, uint256 yusdAmount, uint256 fee)",
  convertToAssets: "function convertToAssets(uint256 shares) view returns (uint256 assets)",
  instantUnstaking: "event InstantUnstaking(address indexed user, address indexed receiver, uint256 assets, uint256 fee)",
}

const METRICS: any = {
  yusdHoldersYield: "YUSD Holder Yield",
  yusdInsuranceYield: "YUSD Insurance Yield",
  yusdInsuranceMintRedeem: "YUSD Mint/Redeem Fees",
  jusdInsuranceMintRedeem: "JUSD Mint/Redeem Fees",
  syusdStakersYield: "sYUSD Staker Yield",
  sjusdStakersYield: "sJUSD Staker Yield",
  syusdInsuranceInstantUnstaking: "sYUSD Unstaking Fees",
  sjusdInsuranceInstantUnstaking: "sJUSD Unstaking Fees",
}

const assetKey = (product: string) => product[0] === "s" ? product.slice(1) : product

const fetch = async (options: FetchOptions) => {
  const config = chainConfig[options.chain]
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  const dailyUserFees = options.createBalances()
  const mintRedeem = Object.fromEntries(config.mintRedeem.map((i: any) => [i.target.toLowerCase(), i]))
  const mintRedeemTargets = Object.keys(mintRedeem)
  const incomeTargets = config.mintRedeem.filter((i: any) => i.income).map((i: any) => i.target)
  const vaults = config.vaults.filter((i: any) => !i.start || options.startTimestamp >= Date.parse(i.start) / 1000)
  const vaultTargets = vaults.map((i: any) => i.target)

  const [incomeLogs, mintLogs, redeemLogs] = await Promise.all([
    options.getLogs({ targets: incomeTargets, eventAbi: abi.depositIncome, onlyArgs: false }),
    options.getLogs({ targets: mintRedeemTargets, eventAbi: abi.mint, onlyArgs: false }),
    options.getLogs({ targets: mintRedeemTargets, eventAbi: abi.redeem, onlyArgs: false }),
  ])

  incomeLogs.forEach((log: any) => {
    const { product } = mintRedeem[log.address.toLowerCase()]
    dailyFees.add(config[product], log.args.yusdAmount + log.args.fee, METRIC.ASSETS_YIELDS)
    dailySupplySideRevenue.add(config[product], log.args.yusdAmount, METRICS.yusdHoldersYield)
    dailySupplySideRevenue.add(config[product], log.args.fee, METRICS.yusdInsuranceYield)
  })

  mintLogs.concat(redeemLogs).forEach((log: any) => {
    const { product } = mintRedeem[log.address.toLowerCase()]
    dailyFees.add(config[product], log.args.fee, METRIC.MINT_REDEEM_FEES)
    dailyUserFees.add(config[product], log.args.fee, METRIC.MINT_REDEEM_FEES)
    dailySupplySideRevenue.add(config[product], log.args.fee, METRICS[`${product}InsuranceMintRedeem`])
  })

  if (vaultTargets.length) {
    const calls = vaultTargets.map((target: string) => ({ target, params: [WAD] }))
    const instantTargets = vaults.filter((i: any) => i.instant).map((i: any) => i.target)
    const [supplies, fromAssets, toAssets, instantLogs] = await Promise.all([
      options.toApi.multiCall({ calls: vaultTargets, abi: "uint256:totalSupply" }),
      options.fromApi.multiCall({ calls, abi: abi.convertToAssets }),
      options.toApi.multiCall({ calls, abi: abi.convertToAssets }),
      instantTargets.length ? options.getLogs({ targets: instantTargets, eventAbi: abi.instantUnstaking, onlyArgs: false }) : [],
    ])
    const vaultMap = Object.fromEntries(vaults.map((i: any) => [i.target.toLowerCase(), i]))

    vaults.forEach(({ product }: any, i: number) => {
      const amount = (BigInt(toAssets[i]) - BigInt(fromAssets[i])) * BigInt(supplies[i]) / WAD
      if (amount <= 0n) return
      dailyFees.add(config[assetKey(product)], amount, METRIC.ASSETS_YIELDS)
      dailySupplySideRevenue.add(config[assetKey(product)], amount, METRICS[`${product}StakersYield`])
    })

    instantLogs.forEach((log: any) => {
      const { product } = vaultMap[log.address.toLowerCase()]
      dailyFees.add(config[assetKey(product)], log.args.fee, METRIC.DEPOSIT_WITHDRAW_FEES)
      dailyUserFees.add(config[assetKey(product)], log.args.fee, METRIC.DEPOSIT_WITHDRAW_FEES)
      dailySupplySideRevenue.add(config[assetKey(product)], log.args.fee, METRICS[`${product}InsuranceInstantUnstaking`])
    })
  }

  return { dailyFees, dailyRevenue, dailySupplySideRevenue, dailyUserFees }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: chainConfig,
  fetch,
  methodology: {
    Fees: "YUSD yield, sYUSD/sJUSD vault yield, YUSD/JUSD mint and redeem fees, and instant unstaking fees.",
    Revenue: "No protocol revenue is counted.",
    SupplySideRevenue: "Rewards paid to users, yield kept in the insurance fund, and yield earned by sYUSD/sJUSD stakers.",
    UserFees: "Mint, redeem, and instant unstaking fees paid by users.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.ASSETS_YIELDS]: "Yield earned by YUSD, sYUSD, and sJUSD.",
      [METRIC.MINT_REDEEM_FEES]: "Fees charged when users mint or redeem YUSD/JUSD.",
      [METRIC.DEPOSIT_WITHDRAW_FEES]: "Fees charged when users instant-unstake sYUSD/sJUSD.",
    },
    SupplySideRevenue: {
      [METRICS.yusdHoldersYield]: "YUSD rewards distributed to YUSD holders.",
      [METRICS.yusdInsuranceYield]: "YUSD yield kept in the insurance fund.",
      [METRICS.yusdInsuranceMintRedeem]: "YUSD mint and redeem fees kept in the insurance fund.",
      [METRICS.jusdInsuranceMintRedeem]: "JUSD mint and redeem fees kept in the insurance fund.",
      [METRICS.syusdStakersYield]: "Yield earned by sYUSD stakers.",
      [METRICS.sjusdStakersYield]: "Yield earned by sJUSD stakers.",
      [METRICS.syusdInsuranceInstantUnstaking]: "sYUSD instant unstaking fees kept in the insurance fund.",
      [METRICS.sjusdInsuranceInstantUnstaking]: "sJUSD instant unstaking fees kept in the insurance fund.",
    },
  },
}

export default adapter
