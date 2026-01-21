import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const cbEggsContract = "0xdDbAbe113c376f51E5817242871879353098c296";
const sendEthAbi = "event SendEth(address to, uint256 amount)";
const feeAddressAbi = "function FEE_ADDRESS() view returns (address)";

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const feeAddress = await options.api.call({
        target: cbEggsContract,
        abi: feeAddressAbi,
    });

    const sendEthLogs = await options.getLogs({
        target: cbEggsContract,
        eventAbi: sendEthAbi,
        onlyArgs: true,
    });

    sendEthLogs.forEach(log => {
        const toAddress = log.to.toLowerCase();
        const amount = Number(log.amount);

        if (toAddress === feeAddress.toLowerCase()) {
            // 10% ETH burned 
            dailyFees.addGasToken(amount * 10 / 9);
            dailyRevenue.addGasToken(amount);
        }
    });

    return {
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
        dailySupplySideRevenue,
    };
};

const methodology = {
    Fees: "Total fees collected from user deposits and withdrawals on the cbEGGS contract.",
    Revenue: "90% of total fees collected are sent to the fee address as revenue.",
};

const adapter: Adapter = {
    version: 2,
    adapter: {
        [CHAIN.BASE]: {
            fetch,
            start: "2025-02-22",
        },
    },
    methodology,
};

export default adapter;