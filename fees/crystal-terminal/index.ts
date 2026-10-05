import { Adapter, FetchOptions } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"

const CRYSTAL = "0x508254c838B2e936B0631440c5C6E3AB3a4a98BD"
const ETH = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
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
  const len = Number(await api.call({ target: CRYSTAL, abi: abi.allMarketsLength }))
  const markets: string[] = await api.multiCall({ target: CRYSTAL, abi: abi.allMarkets, calls: Array.from({ length: len }, (_, i) => i.toString()) })
  const infos = await api.multiCall({ target: CRYSTAL, abi: abi.getMarket, calls: markets, permitFailure: true })
  const info: Record<string, { quote: string, ammFee: bigint }> = {}
  markets.forEach((m, i) => { if (infos[i]) info[m.toLowerCase()] = { quote: infos[i].quoteAsset, ammFee: BigInt(infos[i].marketType) === 4n ? 9900n : 9975n } })
  const [trades, syncs, created, changed, claims, lpTrades, lpChanged] = await Promise.all([
    getLogs({ target: CRYSTAL, eventAbi: abi.Trade, entireLog: true, parseLog: true }),
    getLogs({ target: CRYSTAL, eventAbi: abi.Sync,  entireLog: true, parseLog: true }),
    getLogs({ target: CRYSTAL, eventAbi: abi.MarketCreated, entireLog: true, parseLog: true }),
    getLogs({ target: CRYSTAL, eventAbi: abi.MarketParamsChanged, entireLog: true, parseLog: true }),
    getLogs({ target: CRYSTAL, eventAbi: abi.RewardsClaimed, entireLog: true, parseLog: true }),
    getLogs({ target: CRYSTAL, eventAbi: abi.LaunchpadTrade, entireLog: true, parseLog: true }),
    getLogs({ target: CRYSTAL, eventAbi: abi.LaunchpadParamsChanged, entireLog: true, parseLog: true }),
  ])
  const pos = (l: any) => l.blockNumber * 1e6 + (l.logIndex ?? l.index)
  const startInfos = await fromApi.multiCall({ target: CRYSTAL, abi: abi.getMarket, calls: markets, permitFailure: true })
  const takerAt: Record<string, [number, bigint][]> = {}
  markets.forEach((m, i) => { takerAt[m.toLowerCase()] = [[0, BigInt(startInfos[i]?.takerFee ?? 0)]] })
  for (const [l, m, t] of [...created.map((l: any) => [l, l.parsedLog.args.market, l.parsedLog.args.marketInfo.takerFee]), ...changed.map((l: any) => [l, l.parsedLog.args.market, l.parsedLog.args.takerFee])]) takerAt[m.toLowerCase()]?.push([pos(l), BigInt(t)])
  for (const k in takerAt) takerAt[k].sort((a, b) => a[0] - b[0])
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
    const taker = takerAt[args.market.toLowerCase()].filter(([p]) => p < pos(l)).pop()![1]
    if (taker === 0n) continue
    const spread = 100000n - taker
    const takerFeeAmt = args.isBuy ? BigInt(args.amountIn) * spread / 100000n : BigInt(args.amountOut) * spread / taker
    dailyFees.add(mi.quote, takerFeeAmt.toString())
    const lp = lpByTrade[`${l.transactionHash}:${l.logIndex ?? l.index}`]
    if (lp) dailyFees.add(mi.quote, lp.toString())
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
  for (const q in received) dailyRevenue.add(q, received[q].toString())
  return { dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue }
}

const adapter: Adapter = {
  pullHourly: true,
  version: 2,
  fetch,
  chains: [CHAIN.MONAD],
  start: "2026-09-20",
  methodology: {
    Fees: "Taker fees paid on every orderbook and AMM trade plus the AMM constant-product LP fee. LP fee is derived from Sync reserve-quote deltas per trade so only the AMM portion of a split fill is counted, expressed in the market's quote asset.",
    UserFees: "Same as Fees.",
    Revenue: "Trading fees actually credited to the protocol fee recipient: the day's change in Crystal.claimableRewards[quote][feeRecipient] plus its RewardsClaimed amounts, so referral commissions and creator splits are already excluded. Because gov is the fee recipient, gov's launchpad fee share (from LaunchpadTrade) and claimLockedReserves credits (claimedLockedReserve delta) are subtracted from the native-token figure. AMM LP fees are excluded because they accrue to LPs, not the protocol.",
    ProtocolRevenue: "Same as Revenue.",
  },
}

export default adapter
