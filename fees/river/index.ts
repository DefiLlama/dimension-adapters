import { FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { config } from "./config"

const METRICS = {
    GasCompensation: 'Gas Compensation',
    RedemptionFee: 'Redemption Fees',
    BorrowFees: 'Borrow Fees',
    NymSwapInFee: 'NYM Swap In Fees',
    NymSwapOutFee: 'NYM Swap Out Fees',
}

// River Protocol Events
const RiverRedemptionEvent = 'event Redemption(address _user, uint256 _attemptedDebtAmount, uint256 _actualDebtAmount, uint256 _collateralSent, uint256 _collateralFee)'
const RiverBorrowingEvent = 'event BorrowingFeePaid(address indexed borrower, address indexed collateralToken, uint256 amount)'
const RiverLiquidationEvent = 'event LiquidationTroves(address indexed _troveManager, uint256 _liquidatedDebt, uint256 _liquidatedColl, uint256 _collGasCompensation, uint256 _debtGasCompensation)'

// NYM (Nexus Yield Manager) Events
const NymAssetForDebtTokenSwappedEvent = 'event AssetForDebtTokenSwapped(address indexed sender, address indexed receiver, address indexed asset, uint256 assetAmount, uint256 debtTokenAmount, uint256 fee)'
const NymWithdrawalScheduledEvent = 'event WithdrawalScheduled(address indexed asset, address indexed user, uint256 assetAmount, uint256 fee, uint32 withdrawalTime)'
const NymDebtTokenForAssetSwappedEvent = 'event DebtTokenForAssetSwapped(address indexed sender, address indexed receiver, address indexed asset, uint256 debtTokenAmount, uint256 assetAmount, uint256 fee)'

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
    const { createBalances, getLogs, api, chain } = options
    const dailyFees = createBalances()
    const dailyRevenue = createBalances()
    const dailySupplySideRevenue = createBalances()

    const cfg = config[chain]

    const count = await api.call({
        target: cfg.satoshiXapp,
        abi: 'function troveManagerCount() view returns (uint256)',
        permitFailure: true
    })

    const calls = Array.from({ length: Number(count) }, (_, i) => ({
        target: cfg.satoshiXapp,
        params: [i]
    }))
    const troveManagers = await api.multiCall({
        abi: 'function troveManagers(uint256) view returns (address)',
        calls,
        permitFailure: true
    })
    const collateralTokens = await api.multiCall({
        abi: 'address:collateralToken',
        calls: troveManagers,
        permitFailure: true
    })
    const troveManagerToCollateral: Record<string, string> = {}
    troveManagers.forEach((tm: string, i: number) => {
        if (collateralTokens[i]) {
            troveManagerToCollateral[tm.toLowerCase()] = collateralTokens[i]
        }
    })

    const redemptionLogsArrays = await Promise.all(
        troveManagers.map((tm: string) =>
            getLogs({
                target: tm,
                eventAbi: RiverRedemptionEvent,
                onlyArgs: false,
            })
        )
    )
    const redemptionLogs = redemptionLogsArrays.flat()

    const liquidationLogs = await getLogs({
        target: cfg.satoshiXapp,
        eventAbi: RiverLiquidationEvent,
        onlyArgs: false,
    })

    const borrowingLogs = await getLogs({
        target: cfg.satoshiXapp,
        eventAbi: RiverBorrowingEvent,
    })

    // Fetch NYM events (same satoshiXapp address)
    const nymSwapInLogs = await getLogs({
        target: cfg.satoshiXapp,
        eventAbi: NymAssetForDebtTokenSwappedEvent,
    })

    const nymWithdrawalScheduledLogs = await getLogs({
        target: cfg.satoshiXapp,
        eventAbi: NymWithdrawalScheduledEvent,
    })

    const nymSwapOutLogs = await getLogs({
        target: cfg.satoshiXapp,
        eventAbi: NymDebtTokenForAssetSwappedEvent,
    })

    // Process River Protocol fees
    redemptionLogs.forEach((log) => {
        const collateralToken = troveManagerToCollateral[log.address.toLowerCase()]
        if (!collateralToken) return

        dailyFees.addToken(collateralToken, log.args._collateralFee, METRICS.RedemptionFee)
        dailyRevenue.addToken(collateralToken, log.args._collateralFee, METRICS.RedemptionFee)
    })

    borrowingLogs.forEach((log) => {
        dailyFees.add(cfg.stableCoin, log.amount, METRICS.BorrowFees)
        dailyRevenue.add(cfg.stableCoin, log.amount, METRICS.BorrowFees)
    })

    liquidationLogs.forEach((log) => {
        const collateralToken = troveManagerToCollateral[log.args._troveManager.toLowerCase()]

        dailyFees.add(cfg.stableCoin, log.args._debtGasCompensation, METRICS.GasCompensation)
        dailySupplySideRevenue.add(cfg.stableCoin, log.args._debtGasCompensation, METRICS.GasCompensation)

        if (collateralToken) {
            dailyFees.addToken(collateralToken, log.args._collGasCompensation, METRICS.GasCompensation)
            dailySupplySideRevenue.addToken(collateralToken, log.args._collGasCompensation, METRICS.GasCompensation)
        }
    })

    // Process NYM Protocol fees
    // NYM Swap In: Users swap assets -> debtToken (feeIn: ~0.05%)
    nymSwapInLogs.forEach((log) => {
        if (log.fee && log.fee > 0n) {
            // Fees are in debtToken (stableCoin)
            dailyFees.add(cfg.stableCoin, log.fee, METRICS.NymSwapInFee)
            dailyRevenue.add(cfg.stableCoin, log.fee, METRICS.NymSwapInFee)
        }
    })

    // NYM Swap Out (Scheduled): Users swap debtToken -> assets (feeOut: ~1.00%)
    nymWithdrawalScheduledLogs.forEach((log) => {
        if (log.fee && log.fee > 0n) {
            // Fees are in debtToken (stableCoin)
            dailyFees.add(cfg.stableCoin, log.fee, METRICS.NymSwapOutFee)
            dailyRevenue.add(cfg.stableCoin, log.fee, METRICS.NymSwapOutFee)
        }
    })

    // NYM Privileged Swap Out: Should have 0 fees, but included for completeness
    nymSwapOutLogs.forEach((log) => {
        if (log.fee && log.fee > 0n) {
            dailyFees.add(cfg.stableCoin, log.fee, METRICS.NymSwapOutFee)
            dailyRevenue.add(cfg.stableCoin, log.fee, METRICS.NymSwapOutFee)
        }
    })

    return {
        dailyFees,
        dailyRevenue,
        dailySupplySideRevenue,
        dailyHoldersRevenue: dailyRevenue,
    }
}

export default {
    version: 2,
    adapter: {
        [CHAIN.ARBITRUM]: {
            fetch,
            start: config[CHAIN.ARBITRUM].start,
        },
        [CHAIN.BASE]: {
            fetch,
            start: config[CHAIN.BASE].start,
        },
        [CHAIN.BITLAYER]: {
            fetch,
            start: config[CHAIN.BITLAYER].start,
        },
        [CHAIN.BOB]: {
            fetch,
            start: config[CHAIN.BOB].start,
        },
        [CHAIN.BSC]: {
            fetch,
            start: config[CHAIN.BSC].start,
        },
        [CHAIN.BSQUARED]: {
            fetch,
            start: config[CHAIN.BSQUARED].start,
        },
        [CHAIN.ETHEREUM]: {
            fetch,
            start: config[CHAIN.ETHEREUM].start,
        },
        [CHAIN.HEMI]: {
            fetch,
            start: config[CHAIN.HEMI].start,
        },
    },
    methodology: {
        Fees: 'Combined fees from River Protocol (borrow, redemption, liquidation) and NYM Protocol (swap in/out fees).',
        Revenue: 'River: Borrow and redemption fees to stability pool and satUSD+ holders. NYM: All swap fees to RewardManager for stakers.',
        HoldersRevenue: 'River: Fees to satUSD stability pool and satUSD+ holders. NYM: Swap fees to debtToken stakers.',
        SupplySideRevenue: 'River: Liquidation gas compensations to liquidators.',
    },
    breakdownMethodology: {
        Fees: {
            [METRICS.BorrowFees]: 'One-time borrow fees paid by borrowers.',
            [METRICS.RedemptionFee]: 'Redemption fees paid by borrowers.',
            [METRICS.GasCompensation]: 'Gas compensations paid when liquidations are triggered.',
            [METRICS.NymSwapInFee]: 'Swap in fees when users exchange collateral assets for debtToken. Rate: ~0.05% (5 bps).',
            [METRICS.NymSwapOutFee]: 'Swap out fees when users schedule exchanges of debtToken for collateral assets. Rate: ~1.00% (100 bps).',
        },
        Revenue: {
            [METRICS.BorrowFees]: 'One-time borrow fees paid by borrowers.',
            [METRICS.RedemptionFee]: 'Redemption fees paid by borrowers.',
            [METRICS.NymSwapInFee]: 'Swap in fees sent to RewardManager for distribution to stakers.',
            [METRICS.NymSwapOutFee]: 'Swap out fees sent to RewardManager for distribution to stakers.',
        },
        HoldersRevenue: {
            [METRICS.BorrowFees]: 'Borrow fees distributed to satUSD stability pool and satUSD+ holders.',
            [METRICS.RedemptionFee]: 'Redemption fees distributed to satUSD stability pool and satUSD+ holders.',
            [METRICS.NymSwapInFee]: 'Swap in fees distributed to debtToken stakers via RewardManager.',
            [METRICS.NymSwapOutFee]: 'Swap out fees distributed to debtToken stakers via RewardManager.',
        },
        SupplySideRevenue: {
            [METRICS.GasCompensation]: 'Gas compensations distributed to liquidators.',
        },
    },
}