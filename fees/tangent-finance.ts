import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { getERC4626VaultsYield } from '../helpers/erc4626'
import { METRIC } from '../helpers/metrics'

// https://app.tangent.finance
// Borrowers mint USG against staked Curve LP collateral. Tangent earns borrow interest, denominated
// in USG, plus a cut of the rewards harvested from that collateral. Both are pooled, and the pool
// pays the sUSG savings APY and buys liquidity incentives (bribes).
const USG = '0xb1c2db5d6ca03fce73dbd304d320bf76c55ae1b1'

// accrues borrow interest for every market
const IR_CALCULATOR = '0xB4e1d3bBd2843263d58B4D648C599512cea6e88b'
// harvests collateral rewards, streams them to depositors and keeps the protocol cut
const REWARD_ACCUMULATOR = '0x1461D76aA1C9c523398301D9174098c6D53ce639'
// sUSG, the savings vault paid out of the pool
const SUSG = '0xF17D6f98A5C6EAA99d149079984119e0A4EF6900'

const CheckpointIR = 'event CheckpointIR(address indexed market, uint256 irAmount, uint256 newIndex)'
const RewardNotified = 'event RewardNotified(address market, address token, uint256 streamed, uint256 harvesterFee, uint256 rewardCut)'

const METRICS = {
    HarvesterFees: 'Harvester Fees',
    BorrowInterestToProtocol: 'Borrow Interest To Protocol',
    SavingsPayout: 'Savings Payout To sUSG Savers',
    YieldToDepositors: 'Collateral Yield To Depositors',
    YieldToProtocol: 'Collateral Yield To Protocol',
}

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances()
    const dailyRevenue = options.createBalances()
    const dailySupplySideRevenue = options.createBalances()

    // two earnings legs, held apart until the savings payout is charged to them
    const interestRevenue = options.createBalances()
    const rewardCutRevenue = options.createBalances()

    const [interestLogs, rewardLogs, savingsPayout] = await Promise.all([
        options.getLogs({ target: IR_CALCULATOR, eventAbi: CheckpointIR }),
        options.getLogs({ target: REWARD_ACCUMULATOR, eventAbi: RewardNotified }),
        getERC4626VaultsYield({ options, vaults: [SUSG] }),
    ])

    for (const log of interestLogs) {
        dailyFees.add(USG, log.irAmount, METRIC.BORROW_INTEREST)
        interestRevenue.add(USG, log.irAmount)
    }

    // rewards are harvested in the collateral's reward token (CRV, FXN, BOLD, RLUSD, PYUSD, ...) and
    // split three ways: streamed to depositors, paid to the caller that harvests, kept by the protocol
    for (const log of rewardLogs) {
        dailyFees.add(log.token, log.streamed, METRIC.ASSETS_YIELDS)
        dailyFees.add(log.token, log.harvesterFee, METRIC.ASSETS_YIELDS)
        dailyFees.add(log.token, log.rewardCut, METRIC.ASSETS_YIELDS)

        dailySupplySideRevenue.add(log.token, log.streamed, METRICS.YieldToDepositors)
        dailySupplySideRevenue.add(log.token, log.harvesterFee, METRICS.HarvesterFees)
        rewardCutRevenue.add(log.token, log.rewardCut)
    }

    dailySupplySideRevenue.addBalances(savingsPayout, METRICS.SavingsPayout)

    const [interestUsd, rewardCutUsd, savingsPayoutUsd] = await Promise.all([
        interestRevenue.getUSDValue(),
        rewardCutRevenue.getUSDValue(),
        savingsPayout.getUSDValue(),
    ])

    const pooledRevenueUsd = interestUsd + rewardCutUsd
    if (pooledRevenueUsd > 0) {
        // savings APY is paid out of the pool, so both legs carry it in proportion to their USD
        // weight rather than charging it all to the USG leg it happens to be denominated in
        const keptShare = 1 - savingsPayoutUsd / pooledRevenueUsd
        dailyRevenue.addBalances(interestRevenue.clone(keptShare), METRICS.BorrowInterestToProtocol)
        dailyRevenue.addBalances(rewardCutRevenue.clone(keptShare), METRICS.YieldToProtocol)
    } else {
        // share price accrues in every period while fees arrive in bursts, so a period that pays
        // savers but earns nothing still has to carry the cost, or revenue stops netting off the payout
        dailyRevenue.addBalances(savingsPayout.clone(-1), METRICS.BorrowInterestToProtocol)
    }

    return { dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue: dailyRevenue }
}

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: [CHAIN.ETHEREUM],
    start: '2026-04-25',
    allowNegativeValue: true,
    methodology: {
        Fees: 'Borrow interest paid by USG borrowers, plus every reward harvested from the collateral deposited in Tangent markets.',
        Revenue: 'Borrow interest and the protocol cut of harvested collateral rewards, less what that pool pays out to sUSG savers.',
        SupplySideRevenue: 'What the protocol pays to sUSG savers, the harvested collateral rewards streamed back to depositors, and the fee paid to whoever triggers a harvest.',
        ProtocolRevenue: 'All revenue accrues to the protocol, which spends part of it on liquidity incentives (bribes).',
    },
    breakdownMethodology: {
        Fees: {
            [METRIC.BORROW_INTEREST]: 'Interest accrued by borrowers, read from irAmount on the IRCalculator CheckpointIR event and denominated in USG.',
            [METRIC.ASSETS_YIELDS]: 'Rewards harvested from collateral, read from streamed + harvesterFee + rewardCut on the RewardAccumulator RewardNotified event and denominated in the reward token.',
        },
        Revenue: {
            [METRICS.BorrowInterestToProtocol]: 'Borrow interest kept by the protocol, less its USD-weighted share of the savings payout.',
            [METRICS.YieldToProtocol]: 'RewardCut, the share of harvested collateral rewards kept by the protocol, less its USD-weighted share of the savings payout.',
        },
        SupplySideRevenue: {
            [METRICS.SavingsPayout]: 'Paid to sUSG savers out of the pooled borrow interest and collateral reward cut, measured by the growth of the sUSG share price.',
            [METRICS.YieldToDepositors]: 'streamed, the share of harvested collateral rewards distributed back to depositors.',
            [METRICS.HarvesterFees]: 'harvesterFee, paid to the caller that triggers a harvest.',
        },
        ProtocolRevenue: {
            [METRICS.BorrowInterestToProtocol]: 'Borrow interest kept by the protocol, less its USD-weighted share of the savings payout.',
            [METRICS.YieldToProtocol]: 'rewardCut, the share of harvested collateral rewards kept by the protocol, less its USD-weighted share of the savings payout.',
        },
    },
}

export default adapter
