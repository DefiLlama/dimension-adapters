import { PromisePool } from "@supercharge/promise-pool";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpPost } from "../utils/fetchURL";

// Verus daemon JSON-RPC. The marketapi.verus.services feed this adapter used before stopped reporting lp_volume
// (null for every pool) after conversions halted on 2026-07-23, so volume is now read from the chain itself.
const RPC = 'https://api.verus.services'

// VRSC i-address: every local basket holds it as a reserve, so all conversion volume is denominated in VRSC
const VRSC = 'i5w5MuNik5NtLcYmNzcvaoixooEebB6MGV'

// VerusCoin src/pbaas/reserves.h SUCCESS_FEE = 25000 sats per coin (0.025%); CReserveTransfer::ConversionFee in
// src/pbaas/reserves.cpp doubles it for reserve-to-reserve conversions, which pass through the basket twice
const CONVERSION_FEE = 0.00025
const RESERVE_TO_RESERVE_FEE = 0.0005
// reserves.cpp: "1/2 of all conversion fees go directly into the fractional currency itself", the rest is paid to
// the block producer (miner or staker)
const LIQUIDITY_FEE_SHARE = 0.5

const METRIC = {
  CONVERSION_FEES: 'Conversion Fees',
  FEES_TO_LIQUIDITY: 'Conversion Fees To Basket Liquidity',
  FEES_TO_BLOCK_PRODUCERS: 'Conversion Fees To Miners And Stakers',
}

async function rpc(method: string, params: any[]) {
  const res = await httpPost(RPC, { jsonrpc: '1.0', id: method, method, params })
  if (res.error) throw new Error(`verus rpc ${method} failed: ${JSON.stringify(res.error)}`)
  return res.result
}

// first block with a timestamp >= ts. When the chain has not produced such a block yet, every block up to the tip
// belongs to the window, so the next height is returned.
async function getBlockAtOrAfter(ts: number): Promise<number> {
  const hashes: string[] = await rpc('getblockhashes', [ts + 3600, ts])
  if (!hashes.length) return (await rpc('getblockcount', [])) + 1
  const header = await rpc('getblockheader', [hashes[0]])
  return header.height
}

// fractional baskets that run on Verus itself and hold VRSC as a reserve. Bridge.vARRR, Bridge.vDEX and
// Bridge.CHIPS are listed too but convert on their own PBaaS chains, and the node returns no conversion data for them.
async function getBaskets() {
  const converters: any[] = await rpc('getcurrencyconverters', [VRSC])
  return converters.map((converter) => {
    const id = Object.keys(converter).find((key) => converter[key]?.currencyid === key)
    if (!id) throw new Error(`verus converter ${converter.fullyqualifiedname} has no currency definition`)
    const definition = converter[id]
    return { id, name: converter.fullyqualifiedname as string, startBlock: definition.startblock as number, systemId: definition.systemid as string }
  }).filter((basket) => basket.systemId === VRSC)
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  const dailyRevenue = options.createBalances()

  const fromBlock = await getBlockAtOrAfter(options.startTimestamp)
  const toBlockExclusive = await getBlockAtOrAfter(options.endTimestamp)
  // baskets launched after the window cannot have conversions in it
  const baskets = toBlockExclusive > fromBlock ? (await getBaskets()).filter((basket) => basket.startBlock < toBlockExclusive) : []

  let volume = 0
  let fees = 0
  // one basket at a time: the public node answers 503 when several getcurrencystate scans run at once
  const { errors } = await PromisePool.withConcurrency(1).for(baskets).process(async (basket) => {
    // getcurrencystate sums the imports between consecutive step heights but skips the import AT each step height,
    // so stepping from fromBlock - 1 to toBlockExclusive covers exactly the blocks fromBlock .. toBlockExclusive - 1
    const range = `${fromBlock - 1},${toBlockExclusive},${toBlockExclusive - fromBlock + 1}`
    const states: any[] = await rpc('getcurrencystate', [basket.id, range, VRSC])
    for (const { conversiondata } of states) {
      if (!conversiondata) continue
      if (conversiondata.volumecurrency !== 'VRSC') throw new Error(`verus ${basket.name} volume is in ${conversiondata.volumecurrency}, not VRSC`)
      for (const pair of conversiondata.volumepairs) {
        const isReserveToReserve = pair.currency !== basket.name && pair.convertto !== basket.name
        volume += pair.volume
        fees += pair.volume * (isReserveToReserve ? RESERVE_TO_RESERVE_FEE : CONVERSION_FEE)
      }
    }
  })
  if (errors.length) throw errors[0]

  dailyVolume.addCGToken('verus-coin', volume)
  dailyFees.addCGToken('verus-coin', fees, METRIC.CONVERSION_FEES)
  dailySupplySideRevenue.addCGToken('verus-coin', fees * LIQUIDITY_FEE_SHARE, METRIC.FEES_TO_LIQUIDITY)
  dailyRevenue.addCGToken('verus-coin', fees * (1 - LIQUIDITY_FEE_SHARE), METRIC.FEES_TO_BLOCK_PRODUCERS)

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  }
}

const methodology = {
  Volume: "Value of all conversions processed by the fractional baskets (liquidity pools) on the Verus chain, including conversions into and out of the basket currencies.",
  Fees: "Conversion fees paid by users: 0.025% of every conversion, 0.05% for a conversion between two reserves of a basket.",
  UserFees: "Users pay 0.025% on every conversion and 0.05% on conversions between two reserves of a basket.",
  Revenue: "Half of all conversion fees, paid to the miners and stakers that produce Verus blocks.",
  ProtocolRevenue: "Half of all conversion fees, paid to the miners and stakers that produce Verus blocks.",
  SupplySideRevenue: "Half of all conversion fees, added to the reserves of the basket for its liquidity providers.",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.CONVERSION_FEES]: "0.025% fee on every conversion, 0.05% on conversions between two reserves of a basket.",
  },
  UserFees: {
    [METRIC.CONVERSION_FEES]: "0.025% fee on every conversion, 0.05% on conversions between two reserves of a basket.",
  },
  Revenue: {
    [METRIC.FEES_TO_BLOCK_PRODUCERS]: "Half of conversion fees, paid to the block producer.",
  },
  ProtocolRevenue: {
    [METRIC.FEES_TO_BLOCK_PRODUCERS]: "Half of conversion fees, paid to the block producer.",
  },
  SupplySideRevenue: {
    [METRIC.FEES_TO_LIQUIDITY]: "Half of conversion fees, added to the basket reserves.",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.VERUS],
  start: '2023-06-01',
  methodology,
  breakdownMethodology,
}

export default adapter;
