import { CHAIN } from '../helpers/chains'
import { FetchOptions, SimpleAdapter } from '../adapters/types'

// Flying Tulip ftUSD — yield-bearing stablecoin. The MintAndRedeem engine
// charges a per-collateral fee on every mint and redeem (configured via
// mintFeeBps / redeemFeeBps). Fees are denominated in ftUSD itself, accumulate
// in the engine's claimableFeeAmount, and the owner periodically calls
// sweepFees(to, amount) to send them to the Flying Tulip treasury at
// 0x1118e1c057211306a40A4d7006C040dbfE1370Cb.
//
// All collected fees flow to the protocol treasury, so dailyFees ==
// dailyRevenue == dailyProtocolRevenue. There is no supplier or holder cut on
// this stream.

const MINT_AND_REDEEM: Record<string, string> = {
  [CHAIN.ETHEREUM]: '0xaa48ecbc843cf7e9a29155d112b8cb27902bd23c',
  [CHAIN.SONIC]: '0x0c6f8ec81c3ea5bff06f6cd0791780f9f050ee31',
}

// ftUSD is not yet priced on coins.llama.fi. The fees are denominated in ftUSD
// (6 decimals, dollar pegged), so we attribute the raw amount to a $1 stablecoin
// on the same chain and let the price engine convert it to USD. USDC has 6
// decimals on both chains so the raw amount transfers directly.
const USDC: Record<string, string> = {
  [CHAIN.ETHEREUM]: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  [CHAIN.SONIC]: '0x29219dd400f2bf60e5a23d13be72b486d4038894',
}

const MINTED_EVENT =
  'event Minted(address caller, address indexed from, address indexed to, bytes32 ref, address indexed collateralToken, uint256 collateralAmount, uint256 ftUSDAmount, uint256 feeFtUSDAmount, uint256 wrapperPrincipalAfter)'
const REDEEMED_EVENT =
  'event Redeemed(address caller, address indexed from, address indexed to, bytes32 ref, address indexed collateralToken, uint256 ftUSDAmount, uint256 feeFtUSDAmount, uint256 collateralAmount, uint256 wrapperPrincipalAfter)'

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const target = MINT_AND_REDEEM[options.chain]
  const proxy = USDC[options.chain]
  if (!target || !proxy) {
    return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue: options.createBalances() }
  }

  const [mints, redeems] = await Promise.all([
    options.getLogs({ target, eventAbi: MINTED_EVENT }),
    options.getLogs({ target, eventAbi: REDEEMED_EVENT }),
  ])

  let mintFee = 0n
  for (const log of mints) mintFee += BigInt(log.feeFtUSDAmount.toString())
  let redeemFee = 0n
  for (const log of redeems) redeemFee += BigInt(log.feeFtUSDAmount.toString())

  if (mintFee > 0n) {
    dailyFees.add(proxy, mintFee, 'Mint Fee')
    dailyRevenue.add(proxy, mintFee, 'Mint Fee')
    dailyProtocolRevenue.add(proxy, mintFee, 'Mint Fee')
  }
  if (redeemFee > 0n) {
    dailyFees.add(proxy, redeemFee, 'Redeem Fee')
    dailyRevenue.add(proxy, redeemFee, 'Redeem Fee')
    dailyProtocolRevenue.add(proxy, redeemFee, 'Redeem Fee')
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue: options.createBalances(),
  }
}

const methodology = {
  Fees:
    'Mint and redeem fees charged by the ftUSD MintAndRedeem engine on every mint/redeem, summed from Minted and Redeemed events.',
  Revenue:
    'All ftUSD mint/redeem fees are sent to the Flying Tulip treasury via sweepFees, so revenue equals fees.',
  ProtocolRevenue:
    'Same as Revenue. Fees accumulate in the engine and the owner sweeps them to the treasury (0x1118e1c057211306a40A4d7006C040dbfE1370Cb).',
  SupplySideRevenue:
    'Not applicable. ftUSD does not pay yield to holders directly. Stakers earn separately via sftUSD/EpochRewardsVault, funded by FT bought on the open market with these fees.',
}

const breakdownMethodology = {
  Fees: {
    'Mint Fee':
      'feeFtUSDAmount field of the MintAndRedeem.Minted event, summed over the day window.',
    'Redeem Fee':
      'feeFtUSDAmount field of the MintAndRedeem.Redeemed event, summed over the day window.',
  },
  Revenue: {
    'Mint Fee': 'Mint fees retained by the protocol treasury (no supplier cut).',
    'Redeem Fee': 'Redeem fees retained by the protocol treasury (no supplier cut).',
  },
  ProtocolRevenue: {
    'Mint Fee': 'Mint fees flowing to the Flying Tulip treasury.',
    'Redeem Fee': 'Redeem fees flowing to the Flying Tulip treasury.',
  },
}

const adapter: SimpleAdapter = {
  version: 1,
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2026-01-26',
    },
    [CHAIN.SONIC]: {
      fetch,
      start: '2026-01-26',
    },
  },
}

export default adapter
