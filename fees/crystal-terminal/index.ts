import { Adapter, FetchOptions } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import ADDRESSES from "../../helpers/coreAssets.json"

const CRYSTAL = "0x508254c838B2e936B0631440c5C6E3AB3a4a98BD"
const ETH = ADDRESSES.GAS_TOKEN_2
const abi = {
  allMarketsLength: 'uint256:allMarketsLength',
  allMarkets: 'function allMarkets(uint256) view returns (address)',
  weth: 'address:weth',
  gov: 'address:gov',
  feeRecipient: 'address:feeRecipient',
  claimableRewards: 'function claimableRewards(address, address) view returns (uint256)',
  claimedLockedReserve: 'function claimedLockedReserve(address) view returns (uint256)',
  launchpadParams: 'function launchpadParams() view returns (bool,uint112,uint256,uint256,uint256,uint256,uint256,uint256)',
  getMarket: 'function getMarket(address market) view returns ((address quoteAsset,address baseAsset,uint256 marketType,uint256 highestBid,uint256 lowestAsk,uint256 scaleFactor,uint256 tickSize,uint256 maxPrice,uint256 minSize,uint256 takerFee,uint256 makerRebate,uint256 reserveQuote,uint256 reserveBase,bool isAMMEnabled))',
  Trade: 'event Trade(address indexed market, address indexed user, bool isBuy, uint256 amountIn, uint256 amountOut, uint256 startPrice, uint256 endPrice)',
  Fill: 'event Fill(address indexed market, address indexed user, uint256 fillInfo, uint256 fillAmount)',
  Sync: 'event Sync(address indexed market, uint112 reserve0, uint112 reserve1)',
  MarketCreated: 'event MarketCreated(bool indexed isCanonical, address indexed quoteAsset, address indexed baseAsset, address market, address creator, (address token,uint256 decimals,string ticker,string name) quoteInfo, (address token,uint256 decimals,string ticker,string name) baseInfo, (uint256 marketId,uint256 marketType,uint256 scaleFactor,uint256 tickSize,uint256 maxPrice,uint256 minSize,uint256 takerFee,uint256 makerRebate) marketInfo)',
  MarketParamsChanged: 'event MarketParamsChanged(address indexed market, address creator, uint256 minSize, uint24 takerFee, uint24 makerRebate, uint8 creatorFee, bool isAMMEnabled, bool isCanonical)',
  RewardsClaimed: 'event RewardsClaimed(address indexed user, address[] tokens, uint256[] amounts)',
  LaunchpadTrade: 'event LaunchpadTrade(address indexed token, address indexed user, bool isBuy, uint256 amountIn, uint256 amountOut, uint256 virtualNativeReserve, uint256 virtualTokenReserve)',
  LaunchpadParamsChanged: 'event LaunchpadParamsChanged(bool isTokenCreationPaused, uint112 launchpadInitialNativeSupply, uint256 launchpadFee, uint256 launchpadCreatorFeeSplit, uint256 graduatedMinSize, uint256 graduatedTakerFee, uint256 graduatedMakerRebate, uint256 graduatedCreatorFeeSplit)',
}

const fetch = async ({ api, fromApi, getLogs, createBalances }: FetchOptions) => {
  const dailyFees = createBalances()
  const dailyRevenue = createBalances()
  const dailySupplySideRevenue = createBalances()
  const takerByQuote: Record<string, bigint> = {}
  const len = Number(await api.call({ target: CRYSTAL, abi: abi.allMarketsLength }))
  const markets: string[] = await api.multiCall({ target: CRYSTAL, abi: abi.allMarkets, calls: Array.from({ length: len }, (_, i) => i.toString()) })
  const infos = await api.multiCall({ target: CRYSTAL, abi: abi.getMarket, calls: markets, permitFailure: true })
  const info: Record<string, { quote: string, ammFee: bigint }> = {}
  markets.forEach((m, i) => { if (infos[i]) info[m.toLowerCase()] = { quote: infos[i].quoteAsset, ammFee: BigInt(infos[i].marketType) === 4n ? 9900n : 9975n } })
  const [trades, fills, syncs, created, changed, claims, lpTrades, lpChanged] = await Promise.all([
    getLogs({ target: CRYSTAL, eventAbi: abi.Trade, entireLog: true, parseLog: true }),
    getLogs({ target: CRYSTAL, eventAbi: abi.Fill, entireLog: true, parseLog: true }),
    getLogs({ target: CRYSTAL, eventAbi: abi.Sync,  entireLog: true, parseLog: true }),
    getLogs({ target: CRYSTAL, eventAbi: abi.MarketCreated, entireLog: true, parseLog: true }),
    getLogs({ target: CRYSTAL, eventAbi: abi.MarketParamsChanged, entireLog: true, parseLog: true }),
    getLogs({ target: CRYSTAL, eventAbi: abi.RewardsClaimed, entireLog: true, parseLog: true }),
    getLogs({ target: CRYSTAL, eventAbi: abi.LaunchpadTrade, entireLog: true, parseLog: true }),
    getLogs({ target: CRYSTAL, eventAbi: abi.LaunchpadParamsChanged, entireLog: true, parseLog: true }),
  ])
  const pos = (l: any) => l.blockNumber * 1e6 + (l.logIndex ?? l.index)
  const startInfos = await fromApi.multiCall({ target: CRYSTAL, abi: abi.getMarket, calls: markets, permitFailure: true })
  const feeAt: Record<string, [number, bigint, bigint][]> = {}
  markets.forEach((m, i) => { feeAt[m.toLowerCase()] = [[0, BigInt(startInfos[i]?.takerFee ?? 0), BigInt(startInfos[i]?.makerRebate ?? 0)]] })
  for (const [l, m, t, r] of [...created.map((l: any) => [l, l.parsedLog.args.market, l.parsedLog.args.marketInfo.takerFee, l.parsedLog.args.marketInfo.makerRebate]), ...changed.map((l: any) => [l, l.parsedLog.args.market, l.parsedLog.args.takerFee, l.parsedLog.args.makerRebate])]) feeAt[m.toLowerCase()]?.push([pos(l), BigInt(t), BigInt(r)])
  for (const k in feeAt) feeAt[k].sort((a, b) => a[0] - b[0])
  const syncByMarket: Record<string, any[]> = {}
  for (const s of syncs) (syncByMarket[s.parsedLog.args.market.toLowerCase()] ||= []).push(s)
  for (const k in syncByMarket) syncByMarket[k].sort((a, b) => (a.blockNumber - b.blockNumber) || ((a.logIndex ?? a.index) - (b.logIndex ?? b.index)))
  const marketsWithSyncs = Object.keys(syncByMarket).filter(m => info[m])
  const baseline = await fromApi.multiCall({ target: CRYSTAL, abi: abi.getMarket, calls: marketsWithSyncs, permitFailure: true })
  const fromBlock = await fromApi.getBlock()
  const lpByTrade: Record<string, bigint> = {}
  marketsWithSyncs.forEach((m, i) => {
    if (!baseline[i]) return
    const mi = info[m], spread = 10000n - mi.ammFee
    let prevQ = BigInt(baseline[i].reserveQuote), prevB = BigInt(baseline[i].reserveBase)
    for (const s of syncByMarket[m]) {
      const newQ = BigInt(s.parsedLog.args.reserve0), newB = BigInt(s.parsedLog.args.reserve1)
      if (s.blockNumber === fromBlock) { prevQ = newQ; prevB = newB; continue }
      const dQ = newQ - prevQ
      prevQ = newQ; prevB = newB
      const key = `${s.transactionHash}:${(s.logIndex ?? s.index) + 1}`
      lpByTrade[key] = dQ > 0n ? dQ * spread / 10000n : -dQ * spread / mi.ammFee
    }
  })
  for (const l of trades) {
    const args = l.parsedLog.args
    const mi = info[args.market.toLowerCase()]
    if (!mi) continue
    const taker = feeAt[args.market.toLowerCase()].filter(([p]) => p < pos(l)).pop()![1]
    if (taker === 0n) continue
    const spread = 100000n - taker
    const takerFeeAmt = args.isBuy ? BigInt(args.amountIn) * spread / 100000n : BigInt(args.amountOut) * spread / taker
    const quote = mi.quote.toLowerCase()
    takerByQuote[quote] = (takerByQuote[quote] ?? 0n) + takerFeeAmt
    dailyFees.add(mi.quote, takerFeeAmt.toString(), 'Taker Fees')
    const lp = lpByTrade[`${l.transactionHash}:${l.logIndex ?? l.index}`]
    if (lp) {
      dailyFees.add(mi.quote, lp.toString(), 'AMM LP Fees')
      dailySupplySideRevenue.add(mi.quote, lp.toString(), 'AMM LP Fees To LPs')
    }
  }
  for (const l of fills) {
    const args = l.parsedLog.args
    const mi = info[args.market.toLowerCase()]
    if (!mi) continue
    const rebate = feeAt[args.market.toLowerCase()].filter(([p]) => p < pos(l)).pop()![2]
    if (rebate === 0n) continue
    const rebateAmt = BigInt(args.fillInfo) >> 252n === 0n ? (BigInt(args.fillAmount) >> 128n) * (100000n - rebate) / 100000n : (BigInt(args.fillAmount) & ((1n << 128n) - 1n)) * (100000n - rebate) / rebate
    dailyFees.add(mi.quote, rebateAmt.toString(), 'Maker Rebates')
    dailySupplySideRevenue.add(mi.quote, rebateAmt.toString(), 'Maker Rebates To Makers')
  }
  const weth = (await api.call({ target: CRYSTAL, abi: abi.weth })).toLowerCase()
  const gov = (await api.call({ target: CRYSTAL, abi: abi.gov })).toLowerCase()
  const recipients = [...new Set([await fromApi.call({ target: CRYSTAL, abi: abi.feeRecipient }), await api.call({ target: CRYSTAL, abi: abi.feeRecipient })].map((a: string) => a.toLowerCase()))]
  const pairs = [...new Set(Object.values(info).map(i => i.quote.toLowerCase()))].flatMap(q => recipients.map(r => [q, r]))
  const [startClaimable, endClaimable] = await Promise.all([fromApi, api].map(a => a.multiCall({ target: CRYSTAL, abi: abi.claimableRewards, calls: pairs.map(params => ({ params })) })))
  const received: Record<string, bigint> = {}
  pairs.forEach(([q], i) => { received[q] = (received[q] ?? 0n) + BigInt(endClaimable[i]) - BigInt(startClaimable[i]) })
  for (const l of claims) {
    const args = l.parsedLog.args
    if (l.blockNumber <= fromBlock || !recipients.includes(args.user.toLowerCase())) continue
    args.tokens.forEach((t: string, i: number) => { const q = t.toLowerCase() === ETH ? weth : t.toLowerCase(); if (q in received) received[q] += BigInt(args.amounts[i]) })
  }
  if (recipients.includes(gov) && weth in received) {
    const [startLocked, endLocked] = await Promise.all([fromApi, api].map(a => a.multiCall({ target: CRYSTAL, abi: abi.claimedLockedReserve, calls: markets })))
    markets.forEach((_, i) => { received[weth] -= BigInt(endLocked[i]) - BigInt(startLocked[i]) })
    const startParams = await fromApi.call({ target: CRYSTAL, abi: abi.launchpadParams })
    const paramsAt = [[0, BigInt(startParams[2]), BigInt(startParams[3])], ...lpChanged.map((l: any) => [pos(l), BigInt(l.parsedLog.args.launchpadFee), BigInt(l.parsedLog.args.launchpadCreatorFeeSplit)])].sort((a: any, b: any) => a[0] - b[0]) as [number, bigint, bigint][]
    for (const l of lpTrades) {
      if (l.blockNumber <= fromBlock) continue
      const [, fee, split] = paramsAt.filter(([p]) => p < pos(l)).pop()!
      const args = l.parsedLog.args
      const collected = args.isBuy ? BigInt(args.amountIn) - BigInt(args.amountIn) * fee / 100000n : BigInt(args.amountOut) * (100000n - fee) / fee
      received[weth] -= collected - collected * split / 100n
    }
  }
  for (const q in received) dailyRevenue.add(q, received[q].toString(), 'Trading Fees To Protocol')
  for (const q of new Set([...Object.keys(takerByQuote), ...Object.keys(received)])) {
    const share = (takerByQuote[q] ?? 0n) - (received[q] ?? 0n) // taker fee not credited to the fee recipient
    if (share !== 0n) dailySupplySideRevenue.add(q, share.toString(), 'Taker Fees To Referrers And Creators')
  }
  return { dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue }
}

const adapter: Adapter = {
  pullHourly: true,
  version: 2,
  fetch,
  chains: [CHAIN.MONAD],
  start: "2026-09-20",
  methodology: {
    Fees: "Taker fees paid on every orderbook and AMM trade, plus the AMM constant-product LP fee and the maker rebate takers pay to resting orders. LP fee is derived from Sync reserve-quote deltas per trade so only the AMM portion of a split fill is counted. Maker rebate is derived from each Fill: the maker receives notional * 1e5 / makerRebate, so the rebate is the excess over notional, expressed in the market's quote asset.",
    UserFees: "Taker fees paid on every orderbook and AMM trade, plus the AMM constant-product LP fee and the maker rebate takers pay to resting orders. LP fee is derived from Sync reserve-quote deltas per trade so only the AMM portion of a split fill is counted. Maker rebate is derived from each Fill: the maker receives notional * 1e5 / makerRebate, so the rebate is the excess over notional, expressed in the market's quote asset.",
    Revenue: "Trading fees actually credited to the protocol fee recipient: the day's change in Crystal.claimableRewards[quote][feeRecipient] plus its RewardsClaimed amounts, so referral commissions and creator splits are already excluded. Because gov is the fee recipient, gov's launchpad fee share (from LaunchpadTrade) and claimLockedReserves credits (claimedLockedReserve delta) are subtracted from the native-token figure. AMM LP fees are excluded because they accrue to LPs, not the protocol.",
    ProtocolRevenue: "Trading fees actually credited to the protocol fee recipient: the day's change in Crystal.claimableRewards[quote][feeRecipient] plus its RewardsClaimed amounts, so referral commissions and creator splits are already excluded. Because gov is the fee recipient, gov's launchpad fee share (from LaunchpadTrade) and claimLockedReserves credits (claimedLockedReserve delta) are subtracted from the native-token figure. AMM LP fees are excluded because they accrue to LPs, not the protocol.",
    SupplySideRevenue: "AMM LP fees, maker rebates paid to resting-order makers, and the taker fees paid to referrers and market creators instead of the protocol fee recipient.",
  },
  breakdownMethodology: {
    Fees: {
      'Taker Fees': 'Taker fee charged on each orderbook and AMM trade, in the market quote asset.',
      'AMM LP Fees': 'Constant-product fee earned by AMM LPs, from the quote-reserve change on the Sync that belongs to that trade.',
      'Maker Rebates': 'Rebate paid by takers to makers on each orderbook fill, from the Fill event amounts and the market makerRebate, in the market quote asset.',
    },
    UserFees: {
      'Taker Fees': 'Taker fee charged on each orderbook and AMM trade, in the market quote asset.',
      'AMM LP Fees': 'Constant-product fee earned by AMM LPs, from the quote-reserve change on the Sync that belongs to that trade.',
      'Maker Rebates': 'Rebate paid by takers to makers on each orderbook fill, from the Fill event amounts and the market makerRebate, in the market quote asset.',
    },
    Revenue: {
      'Trading Fees To Protocol': 'Trading fees credited to the protocol fee recipient, after referral commissions, creator splits, launchpad fees, and locked-reserve credits.',
    },
    ProtocolRevenue: {
      'Trading Fees To Protocol': 'Trading fees credited to the protocol fee recipient, after referral commissions, creator splits, launchpad fees, and locked-reserve credits.',
    },
    SupplySideRevenue: {
      'AMM LP Fees To LPs': 'Constant-product fee paid to AMM liquidity providers.',
      'Maker Rebates To Makers': 'Maker rebate paid to the owners of filled resting orders.',
      'Taker Fees To Referrers And Creators': 'Taker fees not credited to the protocol fee recipient, paid to referrers and market creators.',
    },
  },
}

export default adapter
