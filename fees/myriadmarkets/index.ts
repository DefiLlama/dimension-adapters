import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const MARKETS: any = {
  [CHAIN.ABSTRACT]: '0x3e0F5F8F5Fb043aBFA475C0308417Bf72c463289',
  [CHAIN.LINEA]: '0x39e66ee6b2ddaf4defded3038e0162180dbef340',
  [CHAIN.BSC]: '0x39e66ee6b2ddaf4defded3038e0162180dbef340',
}

// Order book (MyriadCTFExchange) is currently BSC-only.
// https://docs.myriad.markets/builders/myriad-order-book
const ORDERBOOK: Record<string, { exchange: string; feeModule: string; manager: string }> = {
  [CHAIN.BSC]: {
    exchange: '0xa0b6f8ef8EdB64f395018D1933f2273Ce9f0f16A',
    feeModule: '0xc1BB36bb0BA236603b95544E809F2ab1893BBC0C',
    manager: '0xaB5591E280fF9Bf368DB60c3b775b5C7Ba5ea3dB',
  },
}

const abi = {
  MarketActionTx: 'event MarketActionTx (address indexed user,uint8 indexed action, uint256 indexed marketId, uint256 outcomeId, uint256 shares, uint256 value, uint256 timestamp)',
  getMarketAltData: 'function getMarketAltData(uint256 marketId) external view returns(uint256 buyFee, bytes32 questionId ,uint256 questionIdUint,address token,uint256 buyTreasuryFee, address treasury ,address realitio ,uint256 realitioTimeout ,address manager)',
  getMarketFees: "function getMarketFees(uint256 marketId) view returns ((uint256 fee, uint256 treasuryFee, uint256 distributorFee) buyFees, (uint256 fee, uint256 treasuryFee, uint256 distributorFee) sellFees, address treasury, address distributor)",
}

const obAbi = {
  OrdersMatched: 'event OrdersMatched(bytes32 makerHash, bytes32 takerHash, address indexed maker, address indexed taker, uint256 indexed marketId, uint8 matchType, uint256 fillAmount, uint256 makerAmountFilled, uint256 takerAmountFilled, uint256 makerFee, uint256 takerFee)',
  CrossMarketOrderFilled: 'event CrossMarketOrderFilled(bytes32 indexed orderHash, bytes32 indexed eventId, uint256 marketId, uint256 fillAmount, uint256 totalFilled)',
  FeesAccrued: 'event FeesAccrued(address indexed token, uint256 amount)',
  getMarketCollateral: 'function getMarketCollateral(uint256 marketId) view returns (address)',
  getObMarketFees: 'function getMarketFees(uint256 marketId) view returns ((uint128 maxPrice, uint64 makerFeeBps, uint64 takerFeeBps)[])',
}

const ONE = 10n ** 18n
const BPS = 10000n
const PRICE_TICKS = 100n

type FeeTier = { maxPrice: bigint; makerFeeBps: bigint; takerFeeBps: bigint }

function parseTiers(raw: any): FeeTier[] {
  if (!raw) return []
  return (Array.isArray(raw) ? raw : []).map((t: any) => ({
    maxPrice: BigInt(t.maxPrice ?? t[0] ?? 0),
    makerFeeBps: BigInt(t.makerFeeBps ?? t[1] ?? 0),
    takerFeeBps: BigInt(t.takerFeeBps ?? t[2] ?? 0),
  }))
}

function feesAtPrice(tiers: FeeTier[], price: bigint): { makerBps: bigint; takerBps: bigint } {
  for (const tier of tiers) {
    if (price <= tier.maxPrice) return { makerBps: tier.makerFeeBps, takerBps: tier.takerFeeBps }
  }
  return { makerBps: 0n, takerBps: 0n }
}

// Direct matches only emit fillAmount (shares) plus fees — not the collateral notional.
// Recover fillAmount * maker.price by finding the unique 0.01 tick whose fee formula
// reproduces the logged makerFee/takerFee for this market's fee curve.
function recoverDirectNotional(fillAmount: bigint, makerFee: bigint, takerFee: bigint, tiers: FeeTier[]): bigint | null {
  if (fillAmount === 0n) return 0n

  const matches: bigint[] = []
  for (let i = 1n; i <= PRICE_TICKS; i++) {
    const price = (i * ONE) / PRICE_TICKS
    const { makerBps, takerBps } = feesAtPrice(tiers, price)
    const notional = (fillAmount * price) / ONE
    if ((notional * makerBps) / BPS === makerFee && (notional * takerBps) / BPS === takerFee) {
      matches.push(notional)
    }
  }

  if (matches.length === 1) return matches[0]
  if (matches.length > 1 && (makerFee > 0n || takerFee > 0n)) {
    return matches[Math.floor(matches.length / 2)]
  }
  return null
}

function uniqueIds(ids: any[]): string[] {
  return [...new Set(ids.map((id) => id.toString()))]
}

async function fetchOrderbook({ api, getLogs, chain }: FetchOptions, dailyVolume: any, dailyNotionalVolume: any, dailyFees: any, dailyRevenue: any) {
  const contracts = ORDERBOOK[chain]
  if (!contracts) return

  const [matchLogs, crossLogs, feeLogs] = await Promise.all([
    getLogs({ target: contracts.exchange, eventAbi: obAbi.OrdersMatched }),
    getLogs({ target: contracts.exchange, eventAbi: obAbi.CrossMarketOrderFilled, entireLog: true, parseLog: true }),
    getLogs({ target: contracts.feeModule, eventAbi: obAbi.FeesAccrued }),
  ])

  for (const log of feeLogs) {
    dailyFees.add(log.token, log.amount, 'Orderbook Fees')
    dailyRevenue.add(log.token, log.amount, 'Orderbook Fees')
  }

  const marketIds = uniqueIds([
    ...matchLogs.map((l: any) => l.marketId),
    ...crossLogs.map((l: any) => (l.args ?? l).marketId),
  ])
  if (!marketIds.length) return

  const [collaterals, feeTiers] = await Promise.all([
    api.multiCall({ target: contracts.manager, abi: obAbi.getMarketCollateral, calls: marketIds, permitFailure: true }),
    api.multiCall({ target: contracts.feeModule, abi: obAbi.getObMarketFees, calls: marketIds, permitFailure: true }),
  ])

  const collateralOf: Record<string, string> = {}
  const tiersOf: Record<string, FeeTier[]> = {}
  marketIds.forEach((id, i) => {
    if (collaterals[i]) collateralOf[id] = collaterals[i]
    tiersOf[id] = parseTiers(feeTiers[i])
  })

  for (const log of matchLogs) {
    const marketId = log.marketId.toString()
    const token = collateralOf[marketId]
    if (!token) continue

    const fillAmount = BigInt(log.fillAmount)
    const matchType = Number(log.matchType)
    dailyNotionalVolume.add(token, fillAmount)

    // matchType: 0 = direct (buy vs sell), 1 = mint, 2 = merge.
    // Mint/merge move `fillAmount` collateral for a complete set. Direct matches
    // move fillAmount * price; recover that from the logged fees + fee curve.
    let cash = fillAmount
    if (matchType === 0) {
      cash = recoverDirectNotional(fillAmount, BigInt(log.makerFee), BigInt(log.takerFee), tiersOf[marketId]) ?? 0n
    }
    if (cash > 0n) dailyVolume.add(token, cash)
  }

  const seenCrossTx = new Set<string>()
  for (const log of crossLogs) {
    const tx = (log.transactionHash || '').toLowerCase()
    if (!tx || seenCrossTx.has(tx)) continue
    seenCrossTx.add(tx)

    const args = log.args ?? log
    const token = collateralOf[args.marketId.toString()]
    if (!token) continue

    const fillAmount = BigInt(args.fillAmount)
    dailyNotionalVolume.add(token, fillAmount)
    dailyVolume.add(token, fillAmount)
  }
}

async function fetch(options: FetchOptions) {
  const { createBalances, chain, api, getLogs } = options
  const market = MARKETS[chain]
  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailySupplySideRevenue = createBalances();
  const dailyRevenue = createBalances();
  const dailyNotionalVolume = createBalances();

  const marketIndex = await api.call({ abi: 'uint256:marketIndex', target: market });

  const marketMapping: any = {}
  let fromIndex = 0;
  const callSize = 20000;
  do {
    let toIndex = fromIndex + callSize;
    if (toIndex > marketIndex) toIndex = marketIndex;
    
    const markets: number[] = [];
    for (let i = fromIndex; i < toIndex; i++) markets.push(i);
    
    const marketData = await api.multiCall({ target: market, abi: abi.getMarketAltData, calls: markets })
    const marketFees = (await api.multiCall({ target: market, abi: abi.getMarketFees, calls: markets }))
    markets.forEach((val:any, idx:any) => marketMapping[val] = {
      token: marketData[idx].token,
      fees: marketFees[idx],
    })
    
    fromIndex += callSize;
    
  } while (fromIndex < marketIndex)
  
  const tradeLogs = await getLogs({ target: market, eventAbi: abi.MarketActionTx, });

  tradeLogs.forEach(({ action, marketId, value, shares }) => {
    value = Number(value)
    action = Number(action)
    shares = Number(shares)

    const { fees, token } = marketMapping[marketId]
    const isBuy = action === 0
    const feeKey = isBuy ? 'buyFees' : 'sellFees'
    const fee = Number(fees[feeKey][0]) / 1e18
    const treasuryFee = Number(fees[feeKey][1]) / 1e18
    const distributorFee = Number(fees[feeKey][2]) / 1e18
    const totalFee = fee + treasuryFee + distributorFee

    switch (action) {
      case 0: // buy
      case 1: // sell
        dailyVolume.add(token, value);
        dailyNotionalVolume.add(token, shares);
        dailyFees.add(token, value * totalFee, isBuy ? 'BuyFee' : 'SellFee')
        dailySupplySideRevenue.add(token, value * distributorFee, 'DistributorFee')
        dailySupplySideRevenue.add(token, value * fee, 'LPFee')
        dailyRevenue.add(token, value * treasuryFee, 'TreasuryFee')
        break;
    }
  });

  await fetchOrderbook(options, dailyVolume, dailyNotionalVolume, dailyFees, dailyRevenue)

  return {
    dailyVolume,
    dailyNotionalVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue
  };
}

const methodology = {
  Fees: "AMM: fees charged on buys/sells (usually 3%). Order book: taker trading fees collected by the FeeModule (price-dependent, peaking near 1% at $0.50).",
  Revenue: "AMM: 1% treasury fee. Order book: taker fees accrued to the FeeModule. Makers pay 0; documented maker rebates are paid periodically off the fee module.",
  ProtocolRevenue: "All revenue go to the protocol",
  SupplySideRevenue: "AMM: 1% fee to reward liquidity providers & 1% fee to the distributors. Order book makers currently pay no fee.",
};

const breakdownMethodology = {
  Fees: {
    'BuyFee': 'Fee charged while buying on the AMM',
    'SellFee': 'Fee charged while selling on the AMM',
    'Orderbook Fees': 'Taker trading fees collected by the order book FeeModule',
  },
  Revenue: {
    'TreasuryFee': 'Part of AMM trading fee that goes to the protocol treasury',
    'Orderbook Fees': 'Order book taker fees accrued to the FeeModule',
  },
  SupplySideRevenue: {
    'DistributorFee': 'Cut from AMM trading fees to the distributors',
    'LPFee': 'Cut from AMM trading fees to the Liquidity providers',
  },
}


const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  breakdownMethodology,
  adapter: {
    [CHAIN.ABSTRACT]: { start: '2025-07-06', },
    [CHAIN.LINEA]: { start: '2025-08-01', },
    [CHAIN.BSC]: { start: '2025-10-29', }
  },
  methodology
};

export default adapter;
