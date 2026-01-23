import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';

const ACCOUNTING = '0xa436c5Dd1Ba62c55D112C10cd10E988bb3355102';
const USDE = '0x4c9EDD5852cd905f086C759E8383e09bff1E68B3';

const FEE_ACCRUED_EVENT = "event FeeAccrued(bool isJrt, uint256 amountToReserve, uint256 amountToTranche)";

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();

    const logs = await options.getLogs({
        target: ACCOUNTING,
        eventAbi: FEE_ACCRUED_EVENT,
    });

    logs.forEach((log: any) => {
        const amountToReserve = BigInt(log.amountToReserve);
        const amountToTranche = BigInt(log.amountToTranche);
        const totalFee = amountToReserve + amountToTranche;

        dailyFees.add(USDE, totalFee);
        dailyRevenue.add(USDE, amountToReserve);
    });

    return {
        dailyFees,
        dailyRevenue,
    }
};

const adapter: SimpleAdapter = {
    methodology: {
        Fees: "All fees collected from withdrawals",
        ProtocolRevenue: "Protocol revenue is the portion of fees that goes to the reserve. Maximum reserve percentage is 2%, currently set to 0."
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
