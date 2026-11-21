import ADDRESSES from '../helpers/coreAssets.json'
import { CHAIN } from '../helpers/chains'
import { FetchOptions, SimpleAdapter } from '../adapters/types'

// Flying Tulip ftUSD — yield-bearing stablecoin. The MintAndRedeem engine
// charges a per-collateral fee on every mint and redeem (configured via
// mintFeeBps / redeemFeeBps). Fees are denominated in ftUSD itself, accumulate
// in the engine's claimableFeeAmount. The owner can call sweepFees(to, amount)
// to send them to the Flying Tulip treasury at
// 0x1118e1c057211306a40A4d7006C040dbfE1370Cb.
//
// Fees are protocol revenue when charged, including any amount awaiting sweep:
// dailyFees == dailyRevenue == dailyProtocolRevenue. There is no supplier or
// holder cut on this stream.

// ftUSD is not yet priced on coins.llama.fi. The fees are denominated in ftUSD
// (6 decimals, dollar pegged), so we attribute the raw amount to a $1 stablecoin
// on the same chain and let the price engine convert it to USD. BSC USDC has
// 18 decimals; Ethereum and Sonic USDC have 6. This retains the existing
// ftUSD/USD pricing-proxy convention, not a market quote for ftUSD.
const contractsConfig: Record<string, { contract: string; usdc: string; start: string; feeScale: bigint }> = {
    [CHAIN.ETHEREUM]: {
        contract: '0xaa48ecbc843cf7e9a29155d112b8cb27902bd23c',
        usdc: ADDRESSES.ethereum.USDC,
        start: '2026-01-26',
        feeScale: 1n,
    },
    [CHAIN.SONIC]: {
        contract: '0x0c6f8ec81c3ea5bff06f6cd0791780f9f050ee31',
        usdc: ADDRESSES.sonic.USDC_e,
        start: '2026-01-26',
        feeScale: 1n,
    },
    [CHAIN.BSC]: {
        // Deployed 2026-07-08; the first verified fee event was 2026-09-24.
        // https://bscscan.com/tx/0x61c715e759c733c9b8604415cdb30e113c17020e772278edb8cc6d3637e18cf0
        contract: '0x7d73863178a3ecb9767f0be1bf50f55305a52743',
        usdc: ADDRESSES.bsc.USDC,
        start: '2026-07-08',
        feeScale: 10n ** 12n,
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
    const feeScale = contractsConfig[options.chain].feeScale

    const [mints, redeems] = await Promise.all([
        options.getLogs({ target, eventAbi: MINTED_EVENT }),
        options.getLogs({ target, eventAbi: REDEEMED_EVENT }),
    ])

    for (const log of mints) {
        const fee = BigInt(log.feeFtUSDAmount) * feeScale
        dailyFees.add(proxy, fee, 'Mint Fee')
        dailyRevenue.add(proxy, fee, 'Mint Fee')
        dailyProtocolRevenue.add(proxy, fee, 'Mint Fee')
    }
    for (const log of redeems) {
        const fee = BigInt(log.feeFtUSDAmount) * feeScale
        dailyFees.add(proxy, fee, 'Redeem Fee')
        dailyRevenue.add(proxy, fee, 'Redeem Fee')
        dailyProtocolRevenue.add(proxy, fee, 'Redeem Fee')
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
        'Mint/redeem fees accrue to the protocol when charged, so revenue equals fees. Accrued fees can subsequently be swept to the Flying Tulip treasury.',
    ProtocolRevenue:
        'Same as Revenue. Fees accumulate in the engine pending an owner sweep to the treasury (0x1118e1c057211306a40A4d7006C040dbfE1370Cb).',
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
    adapter: contractsConfig,
}

export default adapter
