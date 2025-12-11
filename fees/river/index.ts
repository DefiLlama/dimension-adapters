import { FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { config } from "./config"

const METRICS = {
    GasCompensation: 'Gas Compensation',
    RedemptionFee: 'Redemption Fees',
    BorrowFees: 'Borrow Fees',
}

const RiverRedemptionEvent = 'event Redemption(address _user, uint256 _attemptedDebtAmount, uint256 _actualDebtAmount, uint256 _collateralSent, uint256 _collateralFee)'
const RiverBorrowingEvent = 'event BorrowingFeePaid(address indexed borrower, address indexed collateralToken, uint256 amount)'
const RiverLiquidationEvent = 'event LiquidationTroves(address indexed _troveManager, uint256 _liquidatedDebt, uint256 _liquidatedColl, uint256 _collGasCompensation, uint256 _debtGasCompensation)'

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
        Fees: 'One-time borrow fees, redemption fees paid by borrowers, and liquidation gas compensations.',
        Revenue: 'Borrow fees, redemption fees are distibuted to satUSD stability pool and satUSD+ holders.',
        HoldersRevenue: 'Borrow fees and redemption fees are distibuted to the satUSD stability pool and satUSD+ holders.',
        SupplySideRevenue: 'Liquidation gas compensations are distributed supply-side.',
    },
    breakdownMethodology: {
        Fees: {
            [METRICS.BorrowFees]: 'One-time borrow fees paid by borrowers.',
            [METRICS.RedemptionFee]: 'Redemption fees paid by borrowers.',
            [METRICS.GasCompensation]: 'Gas compensations paid when liquidations are triggered.',
        },
        Revenue: {
            [METRICS.BorrowFees]: 'One-time borrow fees paid by borrowers.',
            [METRICS.RedemptionFee]: 'Redemption fees paid by borrowers.',
        },
        HoldersRevenue: {
            [METRICS.BorrowFees]: 'Borrow fees distributed to satUSD stability pool and satUSD+ holders.',
            [METRICS.RedemptionFee]: 'Redemption fees distributed to satUSD stability pool and satUSD+ holders.',
        },
        SupplySideRevenue: {
            [METRICS.GasCompensation]: 'Gas compensations paid to liquidators.',
        },
    },
}