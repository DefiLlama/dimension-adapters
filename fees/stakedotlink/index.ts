import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import coreAssets from "../../helpers/coreAssets.json"

// https://docs.stake.link/faq#id-4.what-fees-does-stake.link-take

const stLink = "0xb8b295df2cd735b15BE5Eb419517Aa626fc43cD5"
const stPol = "0x2ff4390dB61F282Ef4E6D4612c776b809a541753"
const stPolSDLRewardPool = "0x77F555A6B9Ec1fBFf5f545128046338a566b5a56"
const stLinkSDLRewardPools = ["0xbcD10c166b83Edb0EbD05aaca5fACab9C0a307F0", "0x8753C00D1a94D04A01b931830011d882A3F8Cc72"]
const link = coreAssets.ethereum.LINK
const polygon = coreAssets.ethereum.POL
const rewardsEvent = "event UpdateStrategyRewards(address indexed account, uint256 totalStaked, int256 rewardsAmount, uint256 totalFees)"
const distributeEvent = "event DistributeRewards(address indexed sender, uint256 amountStaked, uint256 amount)"

async function fetch(options: FetchOptions) {
    const dailyFees = options.createBalances()
    const dailyProtocolRevenue = options.createBalances()
    const dailyHoldersRevenue = options.createBalances()
    const dailySupplySideRevenue = options.createBalances()
    const [stLinkLogs, stPolLogs, stLinkSDL, stPolSDL] = await Promise.all([
        options.getLogs({
            target: stLink,
            eventAbi: rewardsEvent
        }),
        options.getLogs({
            target: stPol,
            eventAbi: rewardsEvent
        }),
        options.getLogs({
            targets: stLinkSDLRewardPools,
            eventAbi: distributeEvent
        }),
        options.getLogs({
            target: stPolSDLRewardPool,
            eventAbi: distributeEvent,
        })
    ])
    stLinkLogs.forEach(log => {
        const rewards = Number(log.rewardsAmount)
        const fees = Number(log.totalFees)
        dailyFees.add(link, rewards + fees)
        dailyProtocolRevenue.add(link, fees)
        dailySupplySideRevenue.add(link, rewards)
    })
    stPolLogs.forEach(log => {
        const rewards = Number(log.rewardsAmount)
        const fees = Number(log.totalFees)
        dailyFees.add(polygon, rewards)
        dailyProtocolRevenue.add(polygon, fees * 0.375)
        dailyFees.add(polygon, fees * 0.375)
        dailySupplySideRevenue.add(polygon, rewards)
    })
    stLinkSDL.forEach(log => {
        dailyProtocolRevenue.subtractToken(link, log.amount)
        dailyHoldersRevenue.add(link, log.amount)
    })
    stPolSDL.forEach(log => {
        dailyFees.add(polygon, log.amount)
        dailyHoldersRevenue.add(polygon, log.amount)
    })
    const dailyRevenue = dailyProtocolRevenue.clone()
    dailyRevenue.addBalances(dailyHoldersRevenue)

    return {
        dailyFees,
        dailyRevenue,
        dailyHoldersRevenue,
        dailyProtocolRevenue,
        dailySupplySideRevenue
    }
}

const methodology = {
  Fees: "Staking rewards from LINK and POL staking",
  Revenue: "The protocol charges a 26% performance fee on their Node Operator Pool Strategy and 16% on the Community Pool Strategy",
  ProtocolRevenue: "The fees collected by the protocol minus the holders revenue",
  HoldersRevenue: "~57% of the Node Operator Pool Strategy fees and ~62% of the Community Pool Strategy fees are rebased to SDL stakers",
  SupplySideRevenue: "74% of the Node Operator Pool Strategy fees and 84% of the Community Pool Strategy fees are rebased to stakers"
}

const adapter : SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: [CHAIN.ETHEREUM],
    start: "2022-12-05",
    methodology
}

export default adapter