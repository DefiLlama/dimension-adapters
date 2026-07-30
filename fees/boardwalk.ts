import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Boardwalk is a token launchpad: every launched token charges a transfer tax
// (0.95% default, temporarily higher during the post-launch anti-whale window)
// collected by a per-launch FeeDistributor and split by frozen BPS between the
// launch issuer, Boardwalk, LP stakers, an optional referrer and integrators.
// Contracts: https://github.com/useboardwalk/boardwalk-contracts

const LAUNCH_CREATED = 'event LaunchCreated(address indexed token, address indexed issuer, string name, string ticker, string category, string description, uint8 path, string[] issuerFeeLabels, string[] vestingLabels)'
const TAX_RECEIVED = 'event TaxReceived(uint256 amount, uint256 lpShare, uint256 boardwalkShare, uint256 issuerShare, uint256 referrerShare, uint256 integratorShare)'
const EPOCH_EXECUTED = 'event EpochExecuted(uint256 indexed epoch, uint8 option, uint256 raiseTokenAmount, bool forced, address destination)'
const LAUNCH_INFO_ABI = 'function launches(address) view returns (address token, address feeDistributor, address presaleManager, address vestingStream, address lpStaking, address issuer, uint8 path, uint32 createdAt)'

const NULL_ADDRESS = '0x0000000000000000000000000000000000000000'

// LaunchFactory per chain, with its deploy block for the launch enumeration
const config: Record<string, { factory: string, fromBlock: number, start: string }> = {
  [CHAIN.ETHEREUM]: { factory: '0xfAEdbA0E97D5DCD7A29fB6778D7e17b1be35c0b8', fromBlock: 25560628, start: '2026-07-18' },
  [CHAIN.BASE]: { factory: '0x4F7af6f968C30be6FC196Cd5eed68032022AB067', fromBlock: 48800691, start: '2026-07-18' },
  [CHAIN.ARBITRUM]: { factory: '0xe64A71A60D552B56579D8edeB13E86bD6222F882', fromBlock: 485200176, start: '2026-07-18' },
  [CHAIN.ROBINHOOD]: { factory: '0x177dbEDd02cEe010b80a0A3F284c9FD9F67D8a9e', fromBlock: 13115699, start: '2026-07-18' },
}

// BoardwalkFeeCollector.GOVERNANCE_BPS = 9_000: the Boardwalk share is forwarded
// 10% to the treasury and 90% to the GovernanceVoter on Ethereum (non-Ethereum
// revenue is bridged weekly to Ethereum first). The governance 90% is only
// attributed when a weekly epoch executes, per its winning vote option.
const TREASURY_SHARE = 10n

// GovernanceVoter on Ethereum; vote options from GovernanceVoter.sol
const GOVERNANCE_VOTER = '0x2c2E06f6a960921861a8CDf760C59636808E7D50'
const OPTION_TREASURY = 1
const OPTION_BUY_BURN_BWLK = 2
const OPTION_BUY_BURN_LP = 3
const OPTION_PARTICIPATION = 4

const fetch = async (options: FetchOptions) => {
  const { api } = options
  const { factory, fromBlock } = config[options.chain]
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailyHoldersRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const launchLogs = await options.getLogs({ target: factory, eventAbi: LAUNCH_CREATED, fromBlock, cacheInCloud: true })
  const launchTokens = launchLogs.map((log: any) => log.token)
  if (launchTokens.length) {
    const infos = await api.multiCall({ abi: LAUNCH_INFO_ABI, target: factory, calls: launchTokens })
    // the launch token/WETH Uniswap v2 pair, read from the launch's LPStaking;
    // zero address until liquidity is seeded (the tax is zero before seeding)
    const pairs = await api.multiCall({ abi: 'address:lpToken', calls: infos.map((info: any) => info.lpStaking) })
    const seeded = infos
      .map((info: any, i: number) => ({ token: launchTokens[i], feeDistributor: info.feeDistributor, pair: pairs[i] }))
      .filter((launch: any) => launch.pair !== NULL_ADDRESS)

    const taxLogs = seeded.length
      ? await options.getLogs({ targets: seeded.map((launch: any) => launch.feeDistributor), eventAbi: TAX_RECEIVED, flatten: false })
      : []
    // only price launches that actually collected tax this window
    const active = seeded
      .map((launch: any, i: number) => ({ ...launch, logs: taxLogs[i] }))
      .filter((launch: any) => launch.logs.length)

    if (active.length) {
      const token0s = await api.multiCall({ abi: 'address:token0', calls: active.map((launch: any) => launch.pair) })
      const token1s = await api.multiCall({ abi: 'address:token1', calls: active.map((launch: any) => launch.pair) })
      const reserves = await api.multiCall({ abi: 'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)', calls: active.map((launch: any) => launch.pair) })

      active.forEach((launch: any, i: number) => {
        // value the launch-token tax in the pair's raise token (WETH) at spot reserves
        const tokenIs0 = token0s[i].toLowerCase() === launch.token.toLowerCase()
        const raiseToken = tokenIs0 ? token1s[i] : token0s[i]
        const tokenReserve = BigInt(tokenIs0 ? reserves[i].reserve0 : reserves[i].reserve1)
        const raiseReserve = BigInt(tokenIs0 ? reserves[i].reserve1 : reserves[i].reserve0)
        if (tokenReserve === 0n) return // unreachable for a seeded pair (liquidity is permanently locked); guards division only
        const toRaise = (amount: any) => (BigInt(amount) * raiseReserve) / tokenReserve

        launch.logs.forEach((log: any) => {
          dailyFees.add(raiseToken, toRaise(log.amount), 'Token Tax')
          dailyRevenue.add(raiseToken, toRaise(log.boardwalkShare), 'Token Tax To Protocol')
          dailyProtocolRevenue.add(raiseToken, toRaise(log.boardwalkShare) * TREASURY_SHARE / 100n, 'Token Tax To Treasury')
          dailySupplySideRevenue.add(raiseToken, toRaise(log.issuerShare), 'Token Tax To Creators')
          dailySupplySideRevenue.add(raiseToken, toRaise(log.lpShare), 'Token Tax To LP Stakers')
          dailySupplySideRevenue.add(raiseToken, toRaise(log.referrerShare), 'Token Tax To Referrers')
          dailySupplySideRevenue.add(raiseToken, toRaise(log.integratorShare), 'Token Tax To Integrators')
        })
      })
    }
  }

  // the governance 90% is attributed when the weekly epoch executes on Ethereum,
  // per the winning vote option (WETH amounts, per GovernanceVoter.EpochExecuted)
  if (options.chain === CHAIN.ETHEREUM) {
    const weth = await api.call({ abi: 'address:WETH', target: GOVERNANCE_VOTER })
    const executions = await options.getLogs({ target: GOVERNANCE_VOTER, eventAbi: EPOCH_EXECUTED })
    executions.forEach((log: any) => {
      const option = Number(log.option)
      if (log.forced || option === OPTION_TREASURY) dailyProtocolRevenue.add(weth, log.raiseTokenAmount, 'Governance Epochs To Treasury')
      else if (option === OPTION_BUY_BURN_BWLK) dailyHoldersRevenue.add(weth, log.raiseTokenAmount, 'BWLK Buyback Burns')
      else if (option === OPTION_BUY_BURN_LP) dailyHoldersRevenue.add(weth, log.raiseTokenAmount, 'Locked BWLK Liquidity')
      else if (option === OPTION_PARTICIPATION) dailyHoldersRevenue.add(weth, log.raiseTokenAmount, 'Voter Distributions')
    })
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  }
}

const methodology = {
  Fees: 'Transfer tax (0.95% default, higher during the anti-whale decay window after launch) charged on every non-exempt transfer of Boardwalk-launched tokens, valued in WETH at the launch pair spot rate. The Uniswap v2 pair fee is not counted.',
  UserFees: 'Same as Fees: the transfer tax is paid by token senders.',
  Revenue: "Boardwalk's share of the transfer tax (default 35bps of the 95bps tax, 30bps when a referrer is set), split 10% treasury / 90% governance. Revenue from non-Ethereum chains is bridged weekly to Ethereum, where the split applies (net of bridge fees).",
  ProtocolRevenue: 'The treasury 10% of the Boardwalk share, plus governance epoch budgets that weekly votes direct to the treasury (recognized when the epoch executes on Ethereum).',
  HoldersRevenue: 'The governance 90% of the Boardwalk share, recognized when each weekly epoch executes on Ethereum with a BWLK-accruing outcome chosen by sbfBWLK-weighted votes: BWLK buyback-and-burn, buyback into permanently locked BWLK/ETH liquidity, or distribution to voters.',
  SupplySideRevenue: 'Tax shares accruing to launch issuers, stakers of the launch Uniswap v2 LP, referrers and integrators.',
}

const breakdownMethodology = {
  Fees: { 'Token Tax': 'Transfer tax charged on every non-exempt transfer of Boardwalk-launched tokens.' },
  UserFees: { 'Token Tax': 'Transfer tax paid by token senders.' },
  Revenue: { 'Token Tax To Protocol': "Boardwalk's share of the transfer tax (default 35bps, 30bps when a referrer is set)." },
  ProtocolRevenue: {
    'Token Tax To Treasury': '10% of the Boardwalk share, forwarded to the treasury (BoardwalkFeeCollector.GOVERNANCE_BPS).',
    'Governance Epochs To Treasury': 'Weekly governance epoch budgets whose winning vote (or forced fallback) sends the WETH to the treasury.',
  },
  HoldersRevenue: {
    'BWLK Buyback Burns': 'Epoch budgets swapped to BWLK and burned to the dead address.',
    'Locked BWLK Liquidity': 'Epoch budgets used to buy BWLK and mint permanently locked BWLK/ETH liquidity.',
    'Voter Distributions': 'Epoch budgets swapped to BWLK and streamed to the epoch\'s voters.',
  },
  SupplySideRevenue: {
    'Token Tax To Creators': "Launch issuer's share of the transfer tax (default 35bps).",
    'Token Tax To LP Stakers': 'Share streamed to stakers of the launch Uniswap v2 LP via LPStaking fee epochs (default 15bps).',
    'Token Tax To Referrers': "Referrer's share, carved out of the Boardwalk share on Advanced launches (up to 5bps).",
    'Token Tax To Integrators': 'Share split across the five integrator slots (10bps total).',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  adapter: config,
  pullHourly: true,
  methodology,
  breakdownMethodology,
}

export default adapter
