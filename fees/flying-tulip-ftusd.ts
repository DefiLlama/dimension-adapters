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

// ftUSD is not yet priced on coins.llama.fi. The fees are denominated in ftUSD
// (6 decimals, dollar pegged), so we attribute the raw amount to a $1 stablecoin
// on the same chain and let the price engine convert it to USD. USDC has 6
// decimals on both chains so the raw amount transfers directly.
const contractsConfig: Record<string, { contract: string; usdc: string }> = {
    [CHAIN.ETHEREUM]: {
        contract: '0xaa48ecbc843cf7e9a29155d112b8cb27902bd23c',
        usdc: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    },
    [CHAIN.SONIC]: {
        contract: '0x0c6f8ec81c3ea5bff06f6cd0791780f9f050ee31',
        usdc: '0x29219dd400f2bf60e5a23d13be72b486d4038894',
    },
}

const MINTED_EVENT =
    'event Minted(address caller, address indexed from, address indexed to, bytes32 ref, address indexed collateralToken, uint256 collateralAmount, uint256 ftUSDAmount, uint256 feeFtUSDAmount, uint256 wrapperPrincipalAfter)'
const REDEEMED_EVENT =
    'event Redeemed(address caller, address indexed from, address indexed to, bytes32 ref, address indexed collateralToken, uint256 ftUSDAmount, uint256 feeFtUSDAmount, uint256 collateralAmount, uint256 wrapperPrincipalAfter)'

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances()
    const dailyRevenue = options.createBalances()
    const dailyProtocolRevenue = options.createBalances()

    const target = contractsConfig[options.chain].contract
    const proxy = contractsConfig[options.chain].usdc

    const [mints, redeems] = await Promise.all([
        options.getLogs({ target, eventAbi: MINTED_EVENT }),
        options.getLogs({ target, eventAbi: REDEEMED_EVENT }),
    ])

    for (const log of mints) {
        dailyFees.add(proxy, log.feeFtUSDAmount, 'Mint Fee')
        dailyRevenue.add(proxy, log.feeFtUSDAmount, 'Mint Fee')
        dailyProtocolRevenue.add(proxy, log.feeFtUSDAmount, 'Mint Fee')
    }
    for (const log of redeems) {
        dailyFees.add(proxy, log.feeFtUSDAmount, 'Redeem Fee')
        dailyRevenue.add(proxy, log.feeFtUSDAmount, 'Redeem Fee')
        dailyProtocolRevenue.add(proxy, log.feeFtUSDAmount, 'Redeem Fee')
    }

    return {
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue,
        dailySupplySideRevenue: 0,
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
    version: 2,
    pullHourly: true,
    methodology,
    breakdownMethodology,
    fetch,
    start: '2026-01-26',
    chains: Object.keys(contractsConfig),
}

export default adapter
