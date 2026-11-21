import * as sdk from "@defillama/sdk"
import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { METRIC } from "../../helpers/metrics"
import { getModuleEvents, getVersionWindow } from "../../helpers/movement"
import { isCoreAsset } from "../../helpers/prices"

const aptos = sdk.chains.aptos

const AMM = "0x26a95d4bd7d7fc3debf6469ff94837e03e887088bef3a3f2d08d1131141830d3"
const SWAP_EVENT = `${AMM}::liquidity_pool::SwapEvent` // handle event, owner is the pool
const BPS = 10_000n // fee and protocol_fee denominator
const POOL_COUNT_MAX = 1_000
const TREASURY_FEES = "Swap Fees To Treasury"

type Pool = { tokenX: string; tokenY: string; fee: bigint; protocolFee: bigint }

async function getPools(ledgerVersion: number): Promise<Map<string, Pool>> {
  const [countRaw] = await aptos.view<[string]>({ chain: CHAIN.MOVE, function: `${AMM}::liquidity_pool::count_pool`, args: [], ledgerVersion })
  const count = Number(countRaw)
  if (!Number.isSafeInteger(count) || count < 0) throw new Error(`bad Mosaic pool count ${countRaw}`)
  if (count > POOL_COUNT_MAX) throw new Error(`Mosaic pool count ${count} above ${POOL_COUNT_MAX}`)

  // get_pools(limit, offset)
  const [views] = await aptos.view<[any[]]>({ chain: CHAIN.MOVE, function: `${AMM}::liquidity_pool::get_pools`, args: [String(count), "0"], ledgerVersion })
  if (views.length !== count) throw new Error(`get_pools returned ${views.length} of ${count} Mosaic pools`)

  const pools = new Map<string, Pool>()
  for (const view of views) {
    const fee = BigInt(view.fee)
    const protocolFee = BigInt(view.protocol_fee)
    if (fee > BPS || protocolFee > BPS) throw new Error(`bad fees on Mosaic pool ${view.pool_addr}: ${fee}, ${protocolFee}`)
    pools.set(aptos.normalizeAddress(view.pool_addr), { tokenX: view.token_x, tokenY: view.token_y, fee, protocolFee })
  }
  return pools
}

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const { fromVersion, toVersion } = await getVersionWindow(options)
  const pools = await getPools(toVersion)
  const events = await getModuleEvents({ types: [SWAP_EVENT], fromVersion, toVersion })

  for (const { version, account, data: swap } of events) {
    const poolAddress = aptos.normalizeAddress(account)
    if (BigInt(poolAddress) === 0n) throw new Error(`Mosaic SwapEvent without a pool handle in tx ${version}`)
    const pool = pools.get(poolAddress)
    if (!pool) throw new Error(`Mosaic swap in unknown pool ${poolAddress}`)
    const [xIn, xOut, yIn, yOut] = [swap.x_in, swap.x_out, swap.y_in, swap.y_out].map(BigInt)
    if ((xIn > 0n && xOut > 0n) || (yIn > 0n && yOut > 0n)) throw new Error(`Mosaic swap moves one token both ways in pool ${poolAddress}`)

    const [token, amount] = isCoreAsset(CHAIN.MOVE, pool.tokenX) ? [pool.tokenX, xIn + xOut] : [pool.tokenY, yIn + yOut]
    const fee = amount * pool.fee / BPS
    const protocolFee = fee * pool.protocolFee / BPS

    dailyVolume.add(token, amount)
    dailyFees.add(token, fee, METRIC.SWAP_FEES)
    dailyRevenue.add(token, protocolFee, TREASURY_FEES)
    dailySupplySideRevenue.add(token, fee - protocolFee, METRIC.LP_FEES)
  }

  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.MOVE],
  start: "2025-03-01",
  methodology: {
    Volume: "Swaps in Mosaic AMM pools from on-chain liquidity_pool::SwapEvent, priced on one side of each swap.",
    Fees: "Swap fees: each pool's fee rate (1 to 100 bps, read on-chain) applied to the swap volume.",
    Revenue: "The protocol_fee share of swap fees (currently 33.33%) deposited into the pool treasury.",
    ProtocolRevenue: "The protocol_fee share of swap fees deposited into the pool treasury.",
    SupplySideRevenue: "The rest of the swap fees, kept in the pools for liquidity providers.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]: "Fees paid by traders on each swap, at the pool's on-chain fee rate.",
    },
    Revenue: {
      [TREASURY_FEES]: "protocol_fee share of swap fees deposited into the pool treasury.",
    },
    ProtocolRevenue: {
      [TREASURY_FEES]: "protocol_fee share of swap fees deposited into the pool treasury.",
    },
    SupplySideRevenue: {
      [METRIC.LP_FEES]: "Swap fees left in the pools for liquidity providers.",
    },
  },
}

export default adapter
