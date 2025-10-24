import { SimpleAdapter, FetchOptions, FetchResult } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const FEE_ACCURED_EVENT = "event FeeAccrued(address indexed account, bytes32 indexed subaccount, address token, uint256 feeAmount, uint256 balance, uint64 messageIdx)";

const EXCHANGE_GATEWAY = "0xB3cDC82035C495c484C9fF11eD5f3Ff6d342e3cc";

async function fetch(options: FetchOptions): Promise<FetchResult> {
    const dailyFees = options.createBalances();

    const feeAccuredLogs = await options.getLogs({
        target: EXCHANGE_GATEWAY,
        eventAbi: FEE_ACCURED_EVENT
    });

    feeAccuredLogs.forEach((fee: any) => {
        dailyFees.addCGToken("ethena-usde", Number(fee.feeAmount) / 1e9);
    });

    return {
        dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees,
    }
}

const methodology = {
    Fees: "All trading fees paid by users",
    Revenue: "All the fees is revenue",
    ProtocolRevenue: "All the revenue goes to protocol",
}

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    chains: [CHAIN.ETHEREAL],
    methodology,
    start: '2025-10-21'
}

export default adapter;