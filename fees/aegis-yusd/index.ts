import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { METRIC } from "../../helpers/metrics"

interface chainConfigInterface {
  rewards: string,
  yusd: string,
  mintRedeem: string,
  start: string,
} 

const chainContracts: Record<string, chainConfigInterface> = {
  [CHAIN.ETHEREUM]: {
    rewards: "0x8aDCFAf1B64Cc514524B80565bCc732273dDEafD",
    yusd: "0x4274cD7277C7bb0806Bd5FE84b9aDAE466a8DA0a",
    mintRedeem: "0xa30644ca67e0a93805c443df4a6e1856d8bd815b",
    start: "2025-01-23",
  },
  [CHAIN.BSC]: {
    rewards:"0x93eFAA2d2f6c3600d794233ed7E751d086E5B75E",
    yusd: "0xAB3dBcD9B096C3fF76275038bf58eAC10D22C61f",
    mintRedeem: "0x39df2d423df0bddba28f23c15c65a86554a2e141",
    start: "2025-03-31"
  }
}
const depositRewardsEvent = "event DepositRewards(bytes32 id, uint256 amount, uint256 timestamp)"
const mintEvent = "event Mint(address indexed userWallet, address collateralAsset, uint256 collateralAmount, uint256 yusdAmount, uint256 fee)"
const redeemEvent = "event ApproveRedeemRequest(string requestId,address indexed manager,address indexed userWallet,address collateralAsset,uint256 collateralAmount,uint256 yusdAmount,uint256 fee)"


const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  const dailyUserFees = options.createBalances()
  const { rewards, yusd, mintRedeem } = chainContracts[options.chain]
  const [rewardLogs, mintLogs, redeemLogs] = await Promise.all([
    options.getLogs({ target: rewards, eventAbi: depositRewardsEvent}),
    options.getLogs({ target: mintRedeem, eventAbi: mintEvent}),
    options.getLogs({ target: mintRedeem, eventAbi: redeemEvent})
  ])
  rewardLogs.forEach(log => {
    dailyFees.add(yusd, log.amount, METRIC.ASSETS_YIELDS)
    dailySupplySideRevenue.add(yusd, log.amount, METRIC.ASSETS_YIELDS)
  })
  mintLogs.concat(redeemLogs).forEach(log => {
    dailyFees.add(yusd, log.fee, METRIC.MINT_REDEEM_FEES)
    dailyUserFees.add(yusd, log.fee, METRIC.MINT_REDEEM_FEES)
    dailySupplySideRevenue.add(yusd, log.fee, "Mint/Redeem Fees to Insurance Fund")
  })
  return {
    dailyFees,
    dailyRevenue: 0,
    dailySupplySideRevenue,
    dailyUserFees
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch: fetch,
  adapter: chainContracts,
  methodology: {
    Fees: "The yield generated from funds deposited into YUSD + Mint and Redeem fees",
    Revenue: "No revenue",
    SupplySideRevenue: "The yield generated from funds deposited into YUSD is distributed to holders",
    UserFees: "Fees paid on mint and redemption"
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.ASSETS_YIELDS]: "The yield generated from funds deposited into YUSD",
      [METRIC.MINT_REDEEM_FEES]: "Fees charged on mint and redemption"
    },
    SupplySideRevenue: {
      [METRIC.ASSETS_YIELDS]: "The yield generated from funds deposited into YUSD",
      "Mint/Redeem Fees to Insurance Fund": "The mint and redeem fees are sent to the insurance fund",
    }
  }
}
export default adapter