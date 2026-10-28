// StonkDrop (https://stonkdrop.xyz) — a drop machine (gacha) for tokenized stocks on Robinhood Chain.
//
// A player pays a fixed USDG price per drop (commitSpins → SpinsCommitted, `paymentAmount` in USDG).
// A drand beacon then picks a rarity tier and a stock, and the game settles the drop (SpinSettled):
// it pays the tier's fixed USD prize value (`prizeValueWad`, 18 decimals) out of its own vault,
// normally in the chosen Robinhood stock token and, when stock delivery is unavailable, in USDG.
// The vault is protocol-owned: there are no liquidity providers, referrers or token distributions,
// so the house result of settled drops is the protocol's income.
//
//   dailyVolume  = gross receipts: USDG paid for drops committed in the window
//   dailyFees    = receipts − prizes: USDG paid for drops − fixed USD prize value of drops settled in the window
//                  (gross gaming revenue; prizes are the cost of the game)
//                + swap fees the treasury collects from its STONKD/USDG Uniswap v3 position (see below)
//   dailyRevenue = dailyProtocolRevenue = dailyFees (everything stays with the protocol)
//   dailyUserFees = the house result only: the LP fees are paid by STONKD traders, not by players
//
// Prizes are valued at the USD tier value the contract fixes at settlement, which is also what it pays:
// a stock prize is `prizeValueWad / price` tokens at the pinned feed price, a USDG fallback is exactly
// `prizeValueWad / 1e12` USDG. Owner deposits into and withdrawals from the vault are treasury
// movements and are not counted.
//
// The treasury also provided the launch liquidity of $STONKD, StonkDrop's token, as one full-range
// position in the STONKD/USDG 1% Uniswap v3 pool. The swap fees that position earns are counted when
// the treasury claims them: the position manager's Collect minus any DecreaseLiquidity in the same
// window, so principal taken out of the position is not counted. DefiLlama does not price $STONKD, so
// the STONKD half of a claim is converted to USDG at the pool's price in the window, read from the
// pool's last Swap log (a state read at a past block is avoided: the chain's public RPC keeps only a
// few minutes of state). Fees left unclaimed in the pool are not counted. These LP fees are also
// inside Uniswap v3's fees on Robinhood Chain (the pool's protocol-fee switch is on; that cut goes to
// Uniswap, not here).
import ADDRESSES from '../helpers/coreAssets.json'
import { ethers } from 'ethers'
import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'

// https://robinhoodchain.blockscout.com/address/0x22F8e7F1Ea92f31eB3BFA2974EE988C7B2156C37
const STONK_DROP = '0x22F8e7F1Ea92f31eB3BFA2974EE988C7B2156C37'
const USDG = ADDRESSES.robinhood.USDG

// $STONKD / USDG Uniswap v3 pool (1% tier; token0 = USDG, token1 = STONKD) and the Uniswap v3
// NonfungiblePositionManager on Robinhood Chain, which minted the pool's positions.
// https://robinhoodchain.blockscout.com/address/0x4a5996E00065ACd791A44c2115Bb6808b3bC2BA0
const STONKD_POOL = '0x4a5996E00065ACd791A44c2115Bb6808b3bC2BA0'
const POSITION_MANAGER = '0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3'
// The treasury's position(s) in that pool: the full-range launch liquidity, minted with the pool.
const TREASURY_POSITIONS = [1404166]

const abi = {
  SpinsCommitted: 'event SpinsCommitted(uint64 indexed commitmentId, address indexed player, uint64 indexed gachaConfigId, uint64 targetRound, uint64 priceTargetTimestamp, uint16 quantity, uint256 paymentAmount, uint256 reservedValueWad)',
  SpinSettled: 'event SpinSettled(uint64 indexed commitmentId, uint16 index, uint8 rarityIndex, uint128 prizeValueWad, address indexed stockToken, uint8 indexed medium, uint256 payoutAmount)',
  Collect: 'event Collect(uint256 indexed tokenId, address recipient, uint256 amount0, uint256 amount1)',
  DecreaseLiquidity: 'event DecreaseLiquidity(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)',
  Swap: 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)',
  slot0: 'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
}
const COLLECT_TOPIC = ethers.id('Collect(uint256,address,uint256,uint256)')
const DECREASE_TOPIC = ethers.id('DecreaseLiquidity(uint256,uint128,uint256,uint256)')

// prizeValueWad is an 18-decimal USD value; USDG has 6 decimals. The registry only accepts prize
// values on a cent grid, so this division is exact (it is the same conversion the contract uses to
// pay a USDG fallback).
const WAD_TO_USDG = BigInt(1e12)

const L = {
  GGR: 'Drop Gross Gaming Revenue',
  LP: 'Treasury LP Fees',
}

// USDG (token0, 6 decimals) that `stonkd` (token1, 18 decimals) is worth at the pool's sqrtPriceX96:
// price1/0 = (sqrtPriceX96 / 2^96)^2 in raw units, so usdg = stonkd * 2^192 / sqrtPriceX96^2.
const stonkdToUsdg = (stonkd: bigint, sqrtPriceX96: bigint) => (stonkd << BigInt(192)) / (sqrtPriceX96 * sqrtPriceX96)

// The pool's sqrtPriceX96 after the last swap of the window; the pool's current state at the
// window's end block when the window saw no swap.
async function poolSqrtPrice(options: FetchOptions): Promise<bigint> {
  const swaps = await options.getLogs({ target: STONKD_POOL, eventAbi: abi.Swap, onlyArgs: false })
  if (swaps.length) {
    const byChain = (a: any, b: any) => Number(a.blockNumber) - Number(b.blockNumber) || Number(a.logIndex ?? a.index) - Number(b.logIndex ?? b.index)
    const last = [...swaps].sort(byChain).pop()
    return BigInt(last.args.sqrtPriceX96)
  }
  const { sqrtPriceX96 } = await options.toApi.call({ target: STONKD_POOL, abi: abi.slot0 })
  return BigInt(sqrtPriceX96)
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyUserFees = options.createBalances()

  const [commits, settlements] = await Promise.all([
    options.getLogs({ target: STONK_DROP, eventAbi: abi.SpinsCommitted }),
    options.getLogs({ target: STONK_DROP, eventAbi: abi.SpinSettled }),
  ])

  for (const log of commits) {
    dailyVolume.add(USDG, log.paymentAmount)
    dailyFees.add(USDG, log.paymentAmount, L.GGR)
    dailyUserFees.add(USDG, log.paymentAmount, L.GGR)
  }
  for (const log of settlements) {
    const prize = BigInt(log.prizeValueWad) / WAD_TO_USDG
    dailyFees.add(USDG, -prize, L.GGR)
    dailyUserFees.add(USDG, -prize, L.GGR)
  }

  // Swap fees claimed from the treasury's STONKD/USDG position(s): Collect net of DecreaseLiquidity.
  let lpUsdg = BigInt(0)
  let lpStonkd = BigInt(0)
  for (const tokenId of TREASURY_POSITIONS) {
    const idTopic = ethers.zeroPadValue(ethers.toBeHex(tokenId), 32)
    const collects = await options.getLogs({ target: POSITION_MANAGER, eventAbi: abi.Collect, topics: [COLLECT_TOPIC, idTopic] })
    const decreases = await options.getLogs({ target: POSITION_MANAGER, eventAbi: abi.DecreaseLiquidity, topics: [DECREASE_TOPIC, idTopic] })
    for (const log of collects) { lpUsdg += BigInt(log.amount0); lpStonkd += BigInt(log.amount1) }
    for (const log of decreases) { lpUsdg -= BigInt(log.amount0); lpStonkd -= BigInt(log.amount1) }
  }
  if (lpUsdg !== BigInt(0)) dailyFees.add(USDG, lpUsdg, L.LP)
  if (lpStonkd !== BigInt(0)) dailyFees.add(USDG, stonkdToUsdg(lpStonkd, await poolSqrtPrice(options)), L.LP)

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees,
    dailyRevenue: dailyFees.clone(),
    dailyProtocolRevenue: dailyFees.clone(),
    dailySupplySideRevenue: options.createBalances(),
  }
}

const methodology = {
  Volume: 'Gross receipts: the USDG paid for drops committed in the period. Every drop costs the fixed price of the active gacha configuration, $10.00 under configuration 1.',
  Fees: 'Gross receipts minus prizes: the USDG paid for drops less the fixed USD prize value of every drop settled in the period, which the game pays in a Robinhood stock token or, when stock delivery is unavailable, in USDG. Prizes are the cost of the game, so this is what players lost to the house, negative in a period where they win more than they pay in. Plus the swap fees the treasury claims from its launch-liquidity position in the STONKD/USDG Uniswap v3 pool, the STONKD half valued at the pool price when claimed. Unclaimed LP fees are not counted.',
  UserFees: 'The net amount players paid: receipts for drops minus the prize value paid back to them. The LP fees are paid by STONKD traders and are left out.',
  Revenue: 'All of Fees: receipts minus prizes, plus the claimed LP fees. The vault that pays prizes is protocol-owned, with no liquidity providers, referrers or token distributions, so nothing is shared out.',
  ProtocolRevenue: 'The house result, which accrues in the game vault controlled by the team, plus the LP fees the treasury claims. Owner deposits into and withdrawals from the vault are treasury movements and are not counted.',
  SupplySideRevenue: 'Zero: the bankroll is protocol-owned and there are no external liquidity providers.',
}

const breakdownMethodology = {
  Fees: {
    [L.GGR]: 'Receipts for drops (SpinsCommitted.paymentAmount) less the fixed USD prize value of settled drops (SpinSettled.prizeValueWad), paid in stock tokens or USDG.',
    [L.LP]: 'Swap fees claimed by the treasury from its STONKD/USDG Uniswap v3 position (position manager Collect net of DecreaseLiquidity); the STONKD half is valued at the pool price after the last swap of the period. Also inside Uniswap v3 fees on Robinhood Chain.',
  },
  UserFees: {
    [L.GGR]: 'USDG paid for drops net of the prize value paid back to players.',
  },
  Revenue: {
    [L.GGR]: 'The house result of settled drops, kept in the protocol-owned vault.',
    [L.LP]: 'Swap fees claimed by the treasury from its STONKD/USDG position.',
  },
  ProtocolRevenue: {
    [L.GGR]: 'The house result of settled drops, kept in the protocol-owned vault.',
    [L.LP]: 'Swap fees claimed by the treasury from its STONKD/USDG position.',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  // A $10 drop can pay a $250 prize, and prizes settle a few seconds after the paid commit, so a
  // quiet hour or day can pay out more than it takes in; the house result is then legitimately negative.
  allowNegativeValue: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: '2026-10-07', // gacha configuration 1 activated, first drops (block 82667637)
  methodology,
  breakdownMethodology,
}

export default adapter
