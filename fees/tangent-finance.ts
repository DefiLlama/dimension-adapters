import { Balances } from '@defillama/sdk'
import { ethers } from 'ethers'
import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { getERC4626VaultsYield } from '../helpers/erc4626'
import { METRIC } from '../helpers/metrics'
import { httpGet } from '../utils/fetchURL'

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

// multisig, funds the vote incentive campaigns
const TREASURY = '0xD2be17Cf9eE45CaC70264316614180ec608CD856'
// StakeDAO CampaignRemoteManager, pulls the campaign's reward token on createCampaign. Two
// deployments have been used, both kept so historical refills stay correct
const CAMPAIGN_REMOTE_MANAGERS = [
    '0x53aD4Cd1F1e52DD02aa9FC4A8250A1b74F351CA2',
    '0x177198aDb759a9715bC7259BE1b7bE535BeD7542',
].map((address) => address.toLowerCase())

const CheckpointIR = 'event CheckpointIR(address indexed market, uint256 irAmount, uint256 newIndex)'
const RewardNotified = 'event RewardNotified(address market, address token, uint256 streamed, uint256 harvesterFee, uint256 rewardCut)'
const Transfer = 'event Transfer(address indexed from, address indexed to, uint256 value)'
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

// USG is dollar pegged, but its price feed only starts in September 2026, so every USG leg of an
// older period would be valued at zero. Use the feed when it has a price, fall back to the peg.
const usgPrice = async (timestamp: number): Promise<number | undefined> => {
    const key = `ethereum:${USG}`
    // a failed lookup is the same as no feed: fall back to the peg rather than failing the day
    const { coins } = await httpGet(`https://coins.llama.fi/prices/historical/${timestamp}/${key}`)
        .catch(() => ({ coins: {} }))
    return coins[key]?.price
}

const METRICS = {
    HarvesterFees: 'Harvester Fees',
    BorrowInterestToProtocol: 'Borrow Interest To Protocol',
    SavingsPayout: 'Savings Payout To sUSG Savers',
    YieldToDepositors: 'Collateral Yield To Depositors',
    YieldToProtocol: 'Collateral Yield To Protocol',
    Bribes: 'Vote Incentives (Bribes)',
}

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances()
    const dailyRevenue = options.createBalances()
    const dailySupplySideRevenue = options.createBalances()

    // two earnings legs, held apart until the savings payout is charged to them
    const interestRevenue = options.createBalances()
    const rewardCutRevenue = options.createBalances()

    const [interestLogs, rewardLogs, savingsPayout, treasuryTransfers, priceOfUSG] = await Promise.all([
        options.getLogs({ target: IR_CALCULATOR, eventAbi: CheckpointIR }),
        options.getLogs({ target: REWARD_ACCUMULATOR, eventAbi: RewardNotified }),
        getERC4626VaultsYield({ options, vaults: [SUSG] }),
        // campaigns are funded in whatever token they pay out, so scan every token leaving the
        // treasury rather than a fixed target, then keep the ones the campaign manager pulled
        options.getLogs({
            noTarget: true,
            eventAbi: Transfer,
            topics: [TRANSFER_TOPIC, ethers.zeroPadValue(TREASURY, 32), null as any],
            entireLog: true,
            parseLog: true,
            onlyArgs: false
        }),
        usgPrice(options.startTimestamp),
    ])

    // priced by the engine when the feed covers the period, valued at the peg when it does not
    const addUSG = (balances: Balances, amount: any, label?: string) =>
        priceOfUSG === undefined
            ? balances.addUSDValue(Number(amount) / 1e18, label)
            : balances.add(USG, amount, label)

    for (const log of interestLogs) {
        addUSG(dailyFees, log.irAmount, METRIC.BORROW_INTEREST)
        addUSG(interestRevenue, log.irAmount)
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

    // the token the campaign manager pulls is the campaign's reward token, in the amount it pays out
    const bribes = options.createBalances()
    for (const log of treasuryTransfers) {
        if (!CAMPAIGN_REMOTE_MANAGERS.includes(log.args.to.toLowerCase())) continue
        if (log.address.toLowerCase() === USG) addUSG(bribes, log.args.value)
        else bribes.add(log.address, log.args.value)
    }

    dailySupplySideRevenue.addBalances(savingsPayout, METRICS.SavingsPayout)
    dailySupplySideRevenue.addBalances(bribes, METRICS.Bribes)

    // both are paid out of the same pool the two earnings legs feed
    const costs = savingsPayout.clone()
    costs.addBalances(bribes)

    const [interestUsd, rewardCutUsd, costsUsd] = await Promise.all([
        interestRevenue.getUSDValue(),
        rewardCutRevenue.getUSDValue(),
        costs.getUSDValue(),
    ])

    const pooledRevenueUsd = interestUsd + rewardCutUsd
    if (pooledRevenueUsd > 0) {
        // the savings APY and the vote incentives are paid out of the pool, so both legs carry them
        // in proportion to their USD weight rather than charging it all to the USG leg they happen
        // to be denominated in
        const keptShare = 1 - costsUsd / pooledRevenueUsd
        dailyRevenue.addBalances(interestRevenue.clone(keptShare), METRICS.BorrowInterestToProtocol)
        dailyRevenue.addBalances(rewardCutRevenue.clone(keptShare), METRICS.YieldToProtocol)
    } else {
        // share price accrues in every period while fees arrive in bursts, so a period that pays
        // savers but earns nothing still has to carry the cost, or revenue stops netting off the payout
        dailyRevenue.addBalances(costs.clone(-1), METRICS.BorrowInterestToProtocol)
    }

    return { dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue: dailyRevenue }
}

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    chains: [CHAIN.ETHEREUM],
    start: '2026-04-25',
    allowNegativeValue: true,
    pullHourly: true,
    methodology: {
        Fees: 'Borrow interest paid by USG borrowers, plus every reward harvested from the collateral deposited in Tangent markets.',
        Revenue: 'Borrow interest and the protocol cut of harvested collateral rewards, less what that pool pays out to sUSG savers and spends on vote incentives (bribes).',
        SupplySideRevenue: 'What the protocol pays to sUSG savers, the vote incentives (bribes) it buys for its pools, the harvested collateral rewards streamed back to depositors, and the fee paid to whoever triggers a harvest.',
        ProtocolRevenue: 'All revenue accrues to the protocol.',
    },
    breakdownMethodology: {
        Fees: {
            [METRIC.BORROW_INTEREST]: 'Interest accrued by borrowers, read from irAmount on the IRCalculator CheckpointIR event and denominated in USG.',
            [METRIC.ASSETS_YIELDS]: 'Rewards harvested from collateral, read from streamed + harvesterFee + rewardCut on the RewardAccumulator RewardNotified event and denominated in the reward token.',
        },
        Revenue: {
            [METRICS.BorrowInterestToProtocol]: 'Borrow interest kept by the protocol, less its USD-weighted share of the savings payout and the vote incentives.',
            [METRICS.YieldToProtocol]: 'RewardCut, the share of harvested collateral rewards kept by the protocol, less its USD-weighted share of the savings payout and the vote incentives.',
        },
        SupplySideRevenue: {
            [METRICS.SavingsPayout]: 'Paid to sUSG savers out of the pooled borrow interest and collateral reward cut, measured by the growth of the sUSG share price.',
            [METRICS.Bribes]: 'Vote incentives the treasury buys for the USG pools, measured by the reward token and amount the StakeDAO CampaignRemoteManager pulls from the treasury when a campaign is created.',
            [METRICS.YieldToDepositors]: 'streamed, the share of harvested collateral rewards distributed back to depositors.',
            [METRICS.HarvesterFees]: 'harvesterFee, paid to the caller that triggers a harvest.',
        },
        ProtocolRevenue: {
            [METRICS.BorrowInterestToProtocol]: 'Borrow interest kept by the protocol, less its USD-weighted share of the savings payout and the vote incentives.',
            [METRICS.YieldToProtocol]: 'rewardCut, the share of harvested collateral rewards kept by the protocol, less its USD-weighted share of the savings payout and the vote incentives.',
        },
    },
}

export default adapter
