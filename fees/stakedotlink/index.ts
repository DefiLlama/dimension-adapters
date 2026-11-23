import { id, zeroPadValue } from "ethers"
import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import coreAssets from "../../helpers/coreAssets.json"

// https://docs.stake.link/faq#id-4.what-fees-does-stake.link-take

const stLink = "0xb8b295df2cd735b15BE5Eb419517Aa626fc43cD5"
const stPol = "0x2ff4390dB61F282Ef4E6D4612c776b809a541753"
const stPolSDLRewardPool = "0x77F555A6B9Ec1fBFf5f545128046338a566b5a56"
const stLinkSDLRewardPools = ["0xbcD10c166b83Edb0EbD05aaca5fACab9C0a307F0", "0x8753C00D1a94D04A01b931830011d882A3F8Cc72"]
// fee receivers outside the protocol, lowercase
const operatorVCS = "0x4852e48215a4785ee99b640caced5378cc39d2a4" // node operators withdraw their delegation fee from it
const lpDistributors = [
    "0xb413204a73404cab519a4609901abddd06629802", // stLINK Curve gauge distributor until 2025-05
    "0x2cbfc4825a56109b72f1eff0d72c93844404c5ec", // stLINK CurveGaugeDistributor
    "0x949545a9d400cdc177c2fec7f896f2eb35ed640d"  // stPOL CCIPCurveGaugeSender
]
const sdlRewardPools = [...stLinkSDLRewardPools, stPolSDLRewardPool].map(a => a.toLowerCase())
const link = coreAssets.ethereum.LINK
const polygon = coreAssets.ethereum.POL
const rewardsEvent = "event UpdateStrategyRewards(address indexed account, uint256 totalStaked, int256 rewardsAmount, uint256 totalFees)"
const transferEvent = "event Transfer(address indexed from, address indexed to, uint256 value)"
const distributeEvent = "event DistributeRewards(address indexed sender, uint256 amountStaked, uint256 amount)"

async function fetch(options: FetchOptions) {
    const dailyFees = options.createBalances()
    const dailyRevenue = options.createBalances()
    const dailyProtocolRevenue = options.createBalances()
    const dailyHoldersRevenue = options.createBalances()
    const dailySupplySideRevenue = options.createBalances()
    // the pool mints the fee and transfers it to the receivers inside the update transaction, its only outgoing transfers
    const getFeeTransfers = (pool: string) => options.getLogs({
        target: pool,
        eventAbi: transferEvent,
        topics: [id("Transfer(address,address,uint256)"), zeroPadValue(pool, 32)]
    })
    const [stLinkLogs, stPolLogs, stLinkFees, stPolFees, stLinkSDL, stPolSDL] = await Promise.all([
        options.getLogs({
            target: stLink,
            eventAbi: rewardsEvent
        }),
        options.getLogs({
            target: stPol,
            eventAbi: rewardsEvent
        }),
        getFeeTransfers(stLink),
        getFeeTransfers(stPol),
        options.getLogs({
            targets: stLinkSDLRewardPools,
            eventAbi: distributeEvent
        }),
        options.getLogs({
            target: stPolSDLRewardPool,
            eventAbi: distributeEvent,
        })
    ])
    const addRewards = (logs: any[], token: string, asset: string) => logs.forEach(log => {
        const rewards = Number(log.rewardsAmount)
        const fees = Number(log.totalFees)
        // rewardsAmount is the gross reward, totalFees is taken out of it
        dailyFees.add(token, rewards, `${asset} Staking Rewards`)
        dailySupplySideRevenue.add(token, rewards - fees, `${asset} Staking Rewards To Stakers`)
    })
    const addFees = (logs: any[], token: string, asset: string) => logs.forEach(log => {
        const receiver = log.to.toLowerCase()
        if (receiver === operatorVCS)
            dailySupplySideRevenue.add(token, log.value, `${asset} Staking Rewards Fees To Node Operators`)
        else if (lpDistributors.includes(receiver))
            dailySupplySideRevenue.add(token, log.value, `${asset} Staking Rewards Fees To Liquidity Providers`)
        else if (sdlRewardPools.includes(receiver))
            dailyRevenue.add(token, log.value, `${asset} Staking Rewards Fees To SDL Stakers`)
        else {
            dailyRevenue.add(token, log.value, `${asset} Staking Rewards Fees To Protocol`)
            dailyProtocolRevenue.add(token, log.value, `${asset} Staking Rewards Fees To Protocol`)
        }
    })
    addRewards(stLinkLogs, link, 'LINK')
    addRewards(stPolLogs, polygon, 'POL')
    addFees(stLinkFees, link, 'LINK')
    addFees(stPolFees, polygon, 'POL')
    stLinkSDL.forEach(log => {
        dailyHoldersRevenue.add(link, log.amount, 'LINK Staking Rewards Distributed To SDL Stakers')
    })
    // this also pays out stPOL that LSTRewardsSplitter 0x69a7977c sent to the SDL pool from an earlier update, so revenue uses
    // the fee transfers instead: on it the 2026-05-15 13:00 UTC slot would have 245 POL distributed on 62 POL of rewards
    stPolSDL.forEach(log => {
        dailyHoldersRevenue.add(polygon, log.amount, 'POL Staking Rewards Distributed To SDL Stakers')
    })

    return {
        dailyFees,
        dailyRevenue,
        dailyHoldersRevenue,
        dailyProtocolRevenue,
        dailySupplySideRevenue
    }
}

const methodology = {
  Fees: "Gross staking rewards earned by the LINK and POL staking pools, before the protocol's fee",
  Revenue: "The part of the fee on staking rewards that goes to SDL stakers and to the protocol (core contributors and protocol-owned liquidity)",
  ProtocolRevenue: "The fee on staking rewards minus the shares of SDL stakers, node operators and Curve liquidity providers",
  HoldersRevenue: "Staking rewards distributed to SDL stakers: their share of the fee, plus the share of one stPOL deposit's rewards that a splitter contract pays to the SDL reward pool",
  SupplySideRevenue: "Staking rewards after the fee, which go to stLINK and stPOL holders, plus the fee shares of node operators and Curve liquidity providers"
}

const breakdownMethodology = {
  Fees: {
    'LINK Staking Rewards': 'Gross rewards of the stLINK staking pool.',
    'POL Staking Rewards': 'Gross rewards of the stPOL staking pool.'
  },
  Revenue: {
    'LINK Staking Rewards Fees To SDL Stakers': 'Share of the stLINK fee paid to the SDL reward pools.',
    'LINK Staking Rewards Fees To Protocol': 'Share of the stLINK fee paid to core contributors and other protocol wallets.',
    'POL Staking Rewards Fees To SDL Stakers': 'Share of the stPOL fee paid to the SDL reward pool.',
    'POL Staking Rewards Fees To Protocol': 'Share of the stPOL fee paid to core contributors.'
  },
  ProtocolRevenue: {
    'LINK Staking Rewards Fees To Protocol': 'Share of the stLINK fee paid to core contributors and other protocol wallets.',
    'POL Staking Rewards Fees To Protocol': 'Share of the stPOL fee paid to core contributors.'
  },
  HoldersRevenue: {
    'LINK Staking Rewards Distributed To SDL Stakers': 'stLINK distributed by the SDL reward pools, all of it from the stLINK fee.',
    'POL Staking Rewards Distributed To SDL Stakers': 'stPOL distributed by the SDL reward pool: its share of the stPOL fee, plus what LSTRewardsSplitter pays it from the rewards of one stPOL deposit.'
  },
  SupplySideRevenue: {
    'LINK Staking Rewards To Stakers': 'stLINK pool rewards after the fee.',
    'LINK Staking Rewards Fees To Node Operators': 'Delegation fee of the Chainlink node operators.',
    'LINK Staking Rewards Fees To Liquidity Providers': 'Share of the stLINK fee paid as Curve gauge incentives.',
    'POL Staking Rewards To Stakers': 'stPOL pool rewards after the fee.',
    'POL Staking Rewards Fees To Liquidity Providers': 'Share of the stPOL fee paid as Curve gauge incentives.'
  }
}

const adapter : SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: [CHAIN.ETHEREUM],
    start: "2022-12-05",
    methodology,
    breakdownMethodology,
    allowNegativeValue: true // rewardsAmount is an int256: a loss (slashing) is booked negative, it has not happened so far
}

export default adapter