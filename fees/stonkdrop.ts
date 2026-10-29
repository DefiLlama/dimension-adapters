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
// The treasury also provided the launch liquidity of $STONKD, StonkDrop's token, as one position in the
// STONKD/USDG 1% Uniswap v3 pool (800M STONKD, single-sided, from the minimum tick up to the launch
// price). The swap fees that position earns are counted when the treasury claims them: the position
// manager's Collect minus any DecreaseLiquidity in the same window, so principal taken out of the
// position is not counted. Both halves of a claim, USDG and $STONKD, are valued at DefiLlama prices.
// Fees left unclaimed in the pool are not counted. These LP fees are also inside Uniswap v3's fees on
// Robinhood Chain (the pool's protocol-fee switch is on; that cut goes to Uniswap, not here).
import ADDRESSES from '../helpers/coreAssets.json'
import { ethers } from 'ethers'
import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'

// https://robinhoodchain.blockscout.com/address/0x22F8e7F1Ea92f31eB3BFA2974EE988C7B2156C37
const STONK_DROP = '0x22F8e7F1Ea92f31eB3BFA2974EE988C7B2156C37'
const USDG = ADDRESSES.robinhood.USDG

// $STONKD (18 decimals). It trades in the STONKD/USDG 1% Uniswap v3 pool
// 0x4a5996E00065ACd791A44c2115Bb6808b3bC2BA0 (token0 = USDG, token1 = STONKD).
// https://robinhoodchain.blockscout.com/address/0xfeb1AB438e274B2a2Ef0657BE64AA7DB073441a3
const STONKD = '0xfeb1AB438e274B2a2Ef0657BE64AA7DB073441a3'
// Uniswap v3 NonfungiblePositionManager ("Uniswap V3 Positions NFT-V1") on Robinhood Chain, which
// minted the pool's positions and emits their Collect / DecreaseLiquidity events.
// https://robinhoodchain.blockscout.com/address/0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3
const POSITION_MANAGER = '0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3'
// The treasury's position(s) in the STONKD/USDG pool, by position-manager token id: the launch
// liquidity, minted in the pool's creation transaction
// 0x64aa0f477ed2d072b6d606320f17ec8c17fe69c6e860720e7cb3d55cdcc88cd8 (block 82621979, 2026-10-07).
// https://robinhoodchain.blockscout.com/token/0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3/instance/1404166
const TREASURY_POSITIONS = [1404166]

const abi = {
  SpinsCommitted: 'event SpinsCommitted(uint64 indexed commitmentId, address indexed player, uint64 indexed gachaConfigId, uint64 targetRound, uint64 priceTargetTimestamp, uint16 quantity, uint256 paymentAmount, uint256 reservedValueWad)',
  SpinSettled: 'event SpinSettled(uint64 indexed commitmentId, uint16 index, uint8 rarityIndex, uint128 prizeValueWad, address indexed stockToken, uint8 indexed medium, uint256 payoutAmount)',
  Collect: 'event Collect(uint256 indexed tokenId, address recipient, uint256 amount0, uint256 amount1)',
  DecreaseLiquidity: 'event DecreaseLiquidity(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)',
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
  if (lpStonkd !== BigInt(0)) dailyFees.add(STONKD, lpStonkd, L.LP)

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
  Fees: 'Gross receipts minus prizes: the USDG paid for drops less the fixed USD prize value of every drop settled in the period, which the game pays in a Robinhood stock token or, when stock delivery is unavailable, in USDG. Prizes are the cost of the game, so this is what players lost to the house, negative in a period where they win more than they pay in. Plus the swap fees the treasury claims from its launch-liquidity position in the STONKD/USDG Uniswap v3 pool, paid in USDG and STONKD. Unclaimed LP fees are not counted.',
  Revenue: 'All of Fees: receipts minus prizes, plus the claimed LP fees. The vault that pays prizes is protocol-owned, with no liquidity providers, referrers or token distributions, so nothing is shared out.',
  ProtocolRevenue: 'The house result, which accrues in the game vault controlled by the team, plus the LP fees the treasury claims. Owner deposits into and withdrawals from the vault are treasury movements and are not counted.',
  SupplySideRevenue: 'Zero: the bankroll is protocol-owned and there are no external liquidity providers.',
}

const breakdownMethodology = {
  Fees: {
    [L.GGR]: 'Receipts for drops (SpinsCommitted.paymentAmount) less the fixed USD prize value of settled drops (SpinSettled.prizeValueWad), paid in stock tokens or USDG.',
    [L.LP]: 'Swap fees claimed by the treasury from its STONKD/USDG Uniswap v3 position (position manager Collect net of DecreaseLiquidity), paid in USDG and STONKD. Also inside Uniswap v3 fees on Robinhood Chain.',
  },
  UserFees: {
    [L.GGR]: 'The net amount players paid: receipts for drops net of the prize value paid back to them. LP fees are paid by STONKD traders and are left out.',
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
