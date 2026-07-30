import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Boardwalk is a token launchpad: every launched token charges a transfer tax
// (0.95% default, temporarily higher during the post-launch anti-whale window)
// collected by a per-launch FeeDistributor and split by frozen BPS between the
// launch issuer, Boardwalk, LP stakers, an optional referrer and integrators.
// Contracts: https://github.com/useboardwalk/boardwalk-contracts

const LAUNCH_CREATED = 'event LaunchCreated(address indexed token, address indexed issuer, string name, string ticker, string category, string description, uint8 path, string[] issuerFeeLabels, string[] vestingLabels)'
const TAX_RECEIVED = 'event TaxReceived(uint256 amount, uint256 lpShare, uint256 boardwalkShare, uint256 issuerShare, uint256 referrerShare, uint256 integratorShare)'
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
// 90% to the GovernanceVoter (BWLK governance stakers) and 10% to the treasury.
// Non-Ethereum revenue is bridged weekly to Ethereum, where this split applies.
const GOVERNANCE_SHARE = 0.9
const TREASURY_SHARE = 0.1

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

    if (seeded.length) {
      const taxLogs = await options.getLogs({ targets: seeded.map((launch: any) => launch.feeDistributor), eventAbi: TAX_RECEIVED, flatten: false })
      const token0s = await api.multiCall({ abi: 'address:token0', calls: seeded.map((launch: any) => launch.pair) })
      const token1s = await api.multiCall({ abi: 'address:token1', calls: seeded.map((launch: any) => launch.pair) })
      const reserves = await api.multiCall({ abi: 'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)', calls: seeded.map((launch: any) => launch.pair) })

      seeded.forEach((launch: any, i: number) => {
        const logs = taxLogs[i]
        if (!logs.length) return
        // value the launch-token tax in the pair's raise token (WETH) at spot reserves
        const tokenIs0 = token0s[i].toLowerCase() === launch.token.toLowerCase()
        const raiseToken = tokenIs0 ? token1s[i] : token0s[i]
        const tokenReserve = tokenIs0 ? reserves[i].reserve0 : reserves[i].reserve1
        const raiseReserve = tokenIs0 ? reserves[i].reserve1 : reserves[i].reserve0
        if (tokenReserve.toString() === '0') return
        const rate = Number(raiseReserve) / Number(tokenReserve)

        logs.forEach((log: any) => {
          dailyFees.add(raiseToken, Number(log.amount) * rate, 'Token Tax')
          dailyRevenue.add(raiseToken, Number(log.boardwalkShare) * rate, 'Token Tax To Protocol')
          dailyProtocolRevenue.add(raiseToken, Number(log.boardwalkShare) * rate * TREASURY_SHARE, 'Token Tax To Treasury')
          dailyHoldersRevenue.add(raiseToken, Number(log.boardwalkShare) * rate * GOVERNANCE_SHARE, 'Token Tax To BWLK Stakers')
          dailySupplySideRevenue.add(raiseToken, Number(log.issuerShare) * rate, 'Token Tax To Creators')
          dailySupplySideRevenue.add(raiseToken, Number(log.lpShare) * rate, 'Token Tax To LP Stakers')
          dailySupplySideRevenue.add(raiseToken, Number(log.referrerShare) * rate, 'Token Tax To Referrers')
          dailySupplySideRevenue.add(raiseToken, Number(log.integratorShare) * rate, 'Token Tax To Integrators')
        })
      })
    }
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
  Revenue: "Boardwalk's share of the transfer tax (default 35bps of the 95bps tax, 30bps when a referrer is set).",
  ProtocolRevenue: '10% of the Boardwalk share, forwarded to the treasury. Revenue from non-Ethereum chains is bridged weekly to Ethereum, where the treasury/governance split applies (net of bridge fees).',
  HoldersRevenue: '90% of the Boardwalk share, deposited to the GovernanceVoter on Ethereum where weekly sbfBWLK-weighted votes direct it (treasury, BWLK buyback-and-burn, protocol-owned liquidity, or voter distribution). Revenue from non-Ethereum chains is bridged weekly to Ethereum before the split.',
  SupplySideRevenue: 'Tax shares accruing to launch issuers, stakers of the launch Uniswap v2 LP, referrers and integrators.',
}

const breakdownMethodology = {
  Fees: { 'Token Tax': 'Transfer tax charged on every non-exempt transfer of Boardwalk-launched tokens.' },
  UserFees: { 'Token Tax': 'Transfer tax paid by token senders.' },
  Revenue: { 'Token Tax To Protocol': "Boardwalk's share of the transfer tax (default 35bps, 30bps when a referrer is set)." },
  ProtocolRevenue: { 'Token Tax To Treasury': '10% of the Boardwalk share, forwarded to the treasury.' },
  HoldersRevenue: { 'Token Tax To BWLK Stakers': '90% of the Boardwalk share, deposited to the GovernanceVoter for weekly BWLK-staker votes.' },
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
