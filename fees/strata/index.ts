import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import BigNumber from 'bignumber.js';

const ACCOUNTING = '0xa436c5Dd1Ba62c55D112C10cd10E988bb3355102';
const USDE = '0x4c9EDD5852cd905f086C759E8383e09bff1E68B3';

const FEE_ACCRUED_EVENT = "event FeeAccrued(bool isJrt, uint256 amountToReserve, uint256 amountToTranche)";

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const [startBlock, endBlock] = await Promise.all([
        options.getStartBlock(),
        options.getEndBlock(),
    ]);

    // Get NAV and reserveBps
    const [navT0, navT1, reserveBps] = await Promise.all([
        options.api.call({
            target: ACCOUNTING,
            abi: "function nav() view returns (uint256)",
            block: startBlock,
        }),
        options.api.call({
            target: ACCOUNTING,
            abi: "function nav() view returns (uint256)",
            block: endBlock,
        }),
        options.api.call({
            target: ACCOUNTING,
            abi: "function reserveBps() view returns (uint256)",
            block: endBlock,
        }),
    ]);

    // Calculate NAV change (gains/losses)
    const navGrowth = new BigNumber(navT1).minus(new BigNumber(navT0));

    // Calculate performance fees from gains (only if there are gains)
    let performanceFees = new BigNumber(0);
    if (navGrowth.isPositive() && new BigNumber(reserveBps).isPositive()) {
        // Reserve gets a portion of gains: gain * reserveBps / 1e18
        performanceFees = navGrowth.multipliedBy(new BigNumber(reserveBps)).dividedBy(new BigNumber(1e18));
    }

    // Get fees accrued during the period
    let totalAmountToReserve = new BigNumber(0);
    let totalExitFees = new BigNumber(0);

    const logs = await options.getLogs({
        target: ACCOUNTING,
        eventAbi: FEE_ACCRUED_EVENT,
    });
    logs.forEach((log: any) => {
        const amountToReserve = new BigNumber(log.amountToReserve);
        const amountToTranche = new BigNumber(log.amountToTranche);
        const totalFee = amountToReserve.plus(amountToTranche);
        totalExitFees = totalExitFees.plus(totalFee);
        totalAmountToReserve = totalAmountToReserve.plus(amountToReserve);
    });

    let totalReserveGrowth = totalAmountToReserve.plus(performanceFees);

    // Total fees = exit fees + performance fees
    const totalFees = totalExitFees.plus(performanceFees);

    // Revenue = reserve growth (from gains) + tranche fees (portion returned to tranches)
    const trancheFees = totalExitFees.minus(totalAmountToReserve);
    const dailyRevenueAmount = totalReserveGrowth.plus(trancheFees);

    dailyFees.add(USDE, totalFees);
    dailyRevenue.add(USDE, dailyRevenueAmount);
    dailySupplySideRevenue.add(USDE, trancheFees);

    return {
        dailyFees,
        dailyRevenue,
        dailySupplySideRevenue,
    }
};

const adapter: SimpleAdapter = {
    methodology: {
        Fees: "Includes yield generated on deposited assets as well as fees charged by Strata, including performance and redemption fees.",
        ProtocolRevenue: "Protocol revenue consists of performance and redemption fees collected by Strata, including the portion of fees shared with senior and junior tranche holders.",
        SupplySideRevenue: "The portion of fees distributed back to the tranches."
    },
    version: 2,
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch,
            start: "2025-10-05",
        }
    }
}

export default adapter;