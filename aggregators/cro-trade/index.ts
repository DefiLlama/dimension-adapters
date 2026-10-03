import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// cro.trade (https://cro.trade) charges a flat 0.9% on every spot trade it routes on Cronos.
// It is a compile-time constant in every router below (FEE_NUMERATOR = 90 / FEE_DENOMINATOR = 10000,
// FEE_BPS = 90 in the newer contracts), with no tiers or discounts. Each trade emits exactly one fee
// event, also on multihop and split routes, which emit no Swap event at all. So the fee events are the
// one log present on every route, and volume = fee / 0.9% counts each user trade once (taker side),
// however many pool legs the route used.
const FEE_NUMERATOR = 90n
const FEE_DENOMINATOR = 10000n

// CronusBurner: immutable fee sink since 2026-09-22. Every fee it receives is spent buying CRONUS on VVS
// and burning it.
const CRONUS_BURNER = '0x7896c1ce422a2075735375ae916d80a309f453d9'
// cro.trade fee wallet (EOA) used before the burner. Fee receiver of every router deployed before
// 2026-09-22 (feeReceiver() on each), also checked by balance diff on the TG bot and UniversalDexTrader
// trades, whose events do not name a receiver.
const TREASURY = '0x008adf65b8c404e8bba73f18671306066643761f'

const ABI = {
  // CroTradeRouter family (v4/v5/v6c/v7/v9/v10), FOT routers v2/v3/v4, RouterV3Pro v1/v2
  FeeCollected: 'event FeeCollected(address indexed token, uint256 amount, address indexed receiver)',
  // CroTradePackLPRouter: fee is always native CRO
  PackFeeCollected: 'event FeeCollected(uint256 amount, address indexed receiver)',
  // PuushSellRouter: fee is native CRO, receiver read from feeReceiver()
  PuushSold: 'event Sold(address indexed seller, address indexed coin, address indexed main, uint256 amountIn, uint256 croOut, uint256 fee)',
  // TG bot router: fee is native CRO, sent to TREASURY
  TgTradeExecuted: 'event TradeExecuted(address indexed user, address indexed token, string dex, bool isBuy, uint256 amountIn, uint256 amountOut, uint256 fee)',
  // TradingVaultV4 (signless, March 2026): fee is native CRO, sent to TREASURY (feeReceiver())
  VaultTradeExecuted: 'event TradeExecuted(address indexed user, address indexed token, bool isBuy, uint256 amountIn, uint256 amountOut, uint256 fee)',
  VaultBondingTradeExecuted: 'event BondingTradeExecuted(address indexed user, address indexed token, address indexed bonding, bool isBuy, uint256 amountIn, uint256 amountOut, uint256 fee)',
  // UniversalDexTrader (signless): fee is native CRO, sent to TREASURY
  UdtTokensBought: 'event TokensBought(address indexed user, address indexed token, address indexed bonding, uint256 croIn, uint256 tokensOut, uint256 fee)',
  UdtTokensSold: 'event TokensSold(address indexed user, address indexed token, address indexed bonding, uint256 tokensIn, uint256 croOut, uint256 fee)',
  // Cronos Launch trade accounts: one EIP-1167 clone per user, created by the factory. Fee is native CRO
  // to the immutable FEE_RECEIVER = CRONUS_BURNER (FEE_BPS = 90).
  AccountCreated: 'event AccountCreated(address indexed owner, address indexed account)',
  AccountBought: 'event Bought(address indexed token, uint256 croIn, uint256 fee, uint256 tokensOut)',
  AccountSold: 'event Sold(address indexed token, uint256 tokensIn, uint256 croOut, uint256 fee)',
}

// Every router the cro.trade app has sent trades through since launch (2026-03-04), with its creation
// date. Source: the app's deployment records and its backend router allowlist. Event topics were checked
// against each contract's deployed bytecode.
const FEE_COLLECTED_ROUTERS: Record<string, string> = {
  '0x07a383e7833b15d9b1f8bab808255b02bb5a8116': '2026-02-22', // CroTradeRouter v6c, used until 2026-03-04
  '0x76a95ad35f05a40c1da551feae61f00d1379d825': '2026-03-04', // CroTradeRouter v4 (fulcrom fix), 2026-03-04
  '0xa68eb1e3f93bd340205a3e1e03e2a34857219e22': '2026-03-04', // CroTradeRouter v5, 2026-03-04 to 2026-03-06
  '0xb35e8d1e6b64b070fe443205a6b8ea791c62b902': '2026-03-06', // CroTradeRouter v7, 2026-03-06 to 2026-04-02
  '0x96558e33256ce89396439bb0ab9fb784a6ef3018': '2026-04-02', // CroTradeRouterV9, 2026-04-02 to 2026-09-22
  '0xc3e7e9e4e0923c057f1801a985eeb9b6ccffec60': '2026-09-22', // CroTradeRouterV10, fee receiver = CRONUS_BURNER (immutable)
  '0x2ce77a0148afec3112575f870dbd5592137c946a': '2026-03-07', // CroTradeRouterV2 (fee-on-transfer tokens)
  '0xf684a11e6caaec0fcd95da7f8bfce5401a3ea91c': '2026-03-11', // CroTradeRouterV3 (fee-on-transfer tokens), until 2026-09-22
  '0xf19a90a0e47ded86f9cdc4e8021b54bfabcc62f9': '2026-09-22', // CroTradeFotRouterV4, fee receiver = CRONUS_BURNER
  '0xb91644a87bb5f6d7e108a81a517ab1e5a53b43b0': '2026-03-03', // RouterV3ProV2
  '0xfea27f828d0da5a470529d3dd67f0f1a46400985': '2025-11-01', // RouterV3Pro v1
}
const PACK_LP_ROUTER = { address: '0x8749dca7101afcc242668163e57fb1bd862f619f', start: '2026-03-09' }
const PUUSH_SELL_ROUTER = { address: '0xa405b9a29fb24c9c6341a1fd7f59a7fa6a36eeae', start: '2026-08-24' }
const TG_BOT_ROUTER = { address: '0x28d373d407acd655bc1e2922bc4a299ef6f70f0b', start: '2025-09-13' }
const TRADING_VAULT = { address: '0x53c92672a0467a0eedb0ee84e93d7bdabaf6d91f', start: '2026-03-04' }
const UNIVERSAL_DEX_TRADER = { address: '0xb1e1fd27461684a2fdb620b2d8659f664f856816', start: '2025-07-31' }
// Cronos Launch trade-account factories: the first one ran 2026-10-01 21:20-22:19 UTC and was replaced
// by the second; accounts opened by either keep trading.
const CL_ACCOUNT_FACTORIES = [
  { address: '0x6467ec796b3f6e5ce38fd0ba98dc0ca36aa8e8f3', start: '2026-10-01', deployBlock: 97356646 },
  { address: '0x35fb1161d23e1e592dfab6b4d848c13c4874da42', start: '2026-10-01', deployBlock: 97363789 },
]

const LABELS = {
  Fees: METRIC.TRADING_FEES,
  ToTreasury: 'Trading Fees To Treasury',
  ToBuyback: 'Trading Fees To CRONUS Buyback And Burn',
  Buyback: METRIC.TOKEN_BUY_BACK,
}

const toTs = (date: string) => Math.floor(Date.parse(`${date}T00:00:00Z`) / 1000)

const fetch = async (options: FetchOptions) => {
  const { createBalances, getLogs, endTimestamp } = options
  const dailyVolume = createBalances()
  const dailyFees = createBalances()
  const dailyRevenue = createBalances()
  const dailyProtocolRevenue = createBalances()
  const dailyHoldersRevenue = createBalances()

  const live = (start: string) => toTs(start) < endTimestamp

  // token = undefined means native CRO
  const addFee = (token: string | undefined, fee: any, receiver: string) => {
    const amount = BigInt(fee)
    if (amount === 0n) return
    const volume = amount * FEE_DENOMINATOR / FEE_NUMERATOR
    const add = (b: any, value: bigint, label?: string) => token ? b.add(token, value, label) : b.addGasToken(value, label)
    add(dailyVolume, volume)
    add(dailyFees, amount, LABELS.Fees)
    if (receiver.toLowerCase() === CRONUS_BURNER) {
      add(dailyRevenue, amount, LABELS.ToBuyback)
      add(dailyHoldersRevenue, amount, LABELS.Buyback)
    } else {
      add(dailyRevenue, amount, LABELS.ToTreasury)
      add(dailyProtocolRevenue, amount, LABELS.ToTreasury)
    }
  }

  const routers = Object.keys(FEE_COLLECTED_ROUTERS).filter((r) => live(FEE_COLLECTED_ROUTERS[r]))
  if (routers.length) {
    const logs = await getLogs({ targets: routers, eventAbi: ABI.FeeCollected })
    logs.forEach((l: any) => addFee(l.token, l.amount, l.receiver))
  }

  if (live(PACK_LP_ROUTER.start)) {
    const logs = await getLogs({ target: PACK_LP_ROUTER.address, eventAbi: ABI.PackFeeCollected })
    logs.forEach((l: any) => addFee(undefined, l.amount, l.receiver))
  }

  if (live(PUUSH_SELL_ROUTER.start)) {
    const logs = await getLogs({ target: PUUSH_SELL_ROUTER.address, eventAbi: ABI.PuushSold })
    if (logs.length) {
      // settable by the owner: TREASURY until 2026-09-22, CRONUS_BURNER after
      const receiver = await options.fromApi.call({ target: PUUSH_SELL_ROUTER.address, abi: 'address:feeReceiver' })
      logs.forEach((l: any) => addFee(undefined, l.fee, receiver))
    }
  }

  if (live(TG_BOT_ROUTER.start)) {
    const logs = await getLogs({ target: TG_BOT_ROUTER.address, eventAbi: ABI.TgTradeExecuted })
    logs.forEach((l: any) => addFee(undefined, l.fee, TREASURY))
  }

  if (live(TRADING_VAULT.start)) {
    const [trades, bondingTrades] = await Promise.all([
      getLogs({ target: TRADING_VAULT.address, eventAbi: ABI.VaultTradeExecuted }),
      getLogs({ target: TRADING_VAULT.address, eventAbi: ABI.VaultBondingTradeExecuted }),
    ])
    trades.concat(bondingTrades).forEach((l: any) => addFee(undefined, l.fee, TREASURY))
  }

  if (live(UNIVERSAL_DEX_TRADER.start)) {
    const [buys, sells] = await Promise.all([
      getLogs({ target: UNIVERSAL_DEX_TRADER.address, eventAbi: ABI.UdtTokensBought }),
      getLogs({ target: UNIVERSAL_DEX_TRADER.address, eventAbi: ABI.UdtTokensSold }),
    ])
    buys.concat(sells).forEach((l: any) => addFee(undefined, l.fee, TREASURY))
  }

  const factories = CL_ACCOUNT_FACTORIES.filter((f) => live(f.start))
  if (factories.length) {
    const created = await getLogs({
      targets: factories.map((f) => f.address),
      eventAbi: ABI.AccountCreated,
      fromBlock: Math.min(...factories.map((f) => f.deployBlock)),
      cacheInCloud: true,
    })
    const accounts = created.map((l: any) => l.account)
    if (accounts.length) {
      const [buys, sells] = await Promise.all([
        getLogs({ targets: accounts, eventAbi: ABI.AccountBought }),
        getLogs({ targets: accounts, eventAbi: ABI.AccountSold }),
      ])
      buys.concat(sells).forEach((l: any) => addFee(undefined, l.fee, CRONUS_BURNER))
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  }
}

const methodology = {
  Volume: 'Spot trades routed through cro.trade on Cronos (DEX swaps, launchpad bonding-curve trades and Cronos Launch trade accounts), counted once per trade at full notional, derived from the fixed 0.9% cro.trade fee each trade pays on-chain.',
  Fees: 'The 0.9% fee cro.trade charges on every spot trade routed through its contracts on Cronos.',
  UserFees: 'The 0.9% fee cro.trade charges on every spot trade routed through its contracts on Cronos.',
  Revenue: 'All trading fees are kept by cro.trade (no share goes to liquidity providers). Spot referral payouts are made off-chain from another venue and are not deducted.',
  ProtocolRevenue: 'Trading fees paid to the cro.trade treasury wallet: all fees until 2026-09-22, none after.',
  HoldersRevenue: 'Trading fees paid to the CronusBurner contract, which buys CRONUS on the market and burns it: all fees since 2026-09-22, none before.',
}

const breakdownMethodology = {
  Fees: {
    [LABELS.Fees]: 'The 0.9% fee on each spot trade routed by cro.trade, taken in CRO or in the input token.',
  },
  UserFees: {
    [LABELS.Fees]: 'The 0.9% fee on each spot trade routed by cro.trade, taken in CRO or in the input token.',
  },
  Revenue: {
    [LABELS.ToTreasury]: 'Trading fees sent to the cro.trade treasury wallet (until 2026-09-22).',
    [LABELS.ToBuyback]: 'Trading fees sent to the CronusBurner contract to buy back and burn CRONUS (since 2026-09-22).',
  },
  ProtocolRevenue: {
    [LABELS.ToTreasury]: 'Trading fees sent to the cro.trade treasury wallet (until 2026-09-22).',
  },
  HoldersRevenue: {
    [LABELS.Buyback]: 'Trading fees sent to the CronusBurner contract, which buys CRONUS and burns it (since 2026-09-22).',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.CRONOS],
  start: '2026-03-04',
  methodology,
  breakdownMethodology,
}

export default adapter
