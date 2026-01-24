import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import BigNumber from 'bignumber.js';

const ACCOUNTING = '0xa436c5Dd1Ba62c55D112C10cd10E988bb3355102';
const USDE = '0x4c9EDD5852cd905f086C759E8383e09bff1E68B3';

const FEE_ACCRUED_EVENT = "event FeeAccrued(bool isJrt, uint256 amountToReserve, uint256 amountToTranche)";

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();

    const [startBlock, endBlock] = await Promise.all([
        options.getStartBlock(),
        options.getEndBlock(),
    ]);

    const reserveT0 = await options.api.call({
        target: ACCOUNTING,
        abi: "function totalReserve() view returns (uint256)",
        block: startBlock,
    });
    const reserveT1 = await options.api.call({
        target: ACCOUNTING,
        abi: "function totalReserve() view returns (uint256)",
        block: endBlock,
    });

    let reserveGrowth = new BigNumber(reserveT1).minus(new BigNumber(reserveT0));
    if (reserveGrowth.isNegative()) {
        reserveGrowth = new BigNumber(0);
    }

    let totalAmountToReserve = new BigNumber(0);
    let totalExitFees = new BigNumber(0);
    let performanceFees = new BigNumber(0);

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

    performanceFees = reserveGrowth.minus(totalAmountToReserve);
    if (performanceFees.isNegative()) {
        performanceFees = new BigNumber(0);
    }

    const trancheFees = totalExitFees.minus(totalAmountToReserve);

    dailyFees.add(USDE, totalExitFees.plus(performanceFees));
    dailyRevenue.add(USDE, reserveGrowth.plus(trancheFees));

    return {
        dailyFees,
        dailyRevenue,
    }
};

const adapter: SimpleAdapter = {
    methodology: {
        Fees: "Includes yield generated on deposited assets as well as fees charged by Strata, including performance and redemption fees.",
        ProtocolRevenue: "Protocol revenue consists of performance and redemption fees collected by Strata, including the portion of fees shared with senior and junior tranche holders."
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
