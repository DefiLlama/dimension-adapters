import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const AETHIR_CORE = "0x226DC7D2AA1F9a565e82faf04772FDbBaF2da42d";
const AETHIR_TOKEN = "0xc87B37a581ec3257B734886d9d3a581F5A9d056c";

const DEPOSIT_SERVICE_FEE_EVENT = "event DepositServiceFee (address indexed developer, uint64 nonce, uint256 amount)";

const WITHDRAW_SERVICE_FEE_EVENT = "event WithdrawServiceFee (address indexed developer, uint64 nonce, uint256 amount)";

async function fetch(options: FetchOptions): Promise<FetchResult> {
    const dailyFees = options.createBalances();

    const serviceFeeDepositLogs = await options.getLogs({
        eventAbi: DEPOSIT_SERVICE_FEE_EVENT,
        target: AETHIR_CORE
    });

    const serviceFeeWithdrawalLogs = await options.getLogs({
        eventAbi: WITHDRAW_SERVICE_FEE_EVENT,
        target: AETHIR_CORE
    });

    serviceFeeDepositLogs.forEach((deposit: any) => dailyFees.add(AETHIR_TOKEN, deposit.amount));

    serviceFeeWithdrawalLogs.forEach((withdraw: any) => dailyFees.subtractToken(AETHIR_TOKEN, withdraw.amount));

    const dailyRevenue = dailyFees.clone(0.2);

    return {
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
        dailySupplySideRevenue: dailyFees.clone(0.8),
    }
}

const methodology = {
    Fees: "Service fees paid by developers to use aethir GPU services",
    Revenue: "20% protocol fees charged by aethir",
    ProtocolRevenue: "All revenue goes to protocol",
    SupplySideRevenue: "80% of the service fees goes to GPU service providers"
};

const adapter: SimpleAdapter = {
    fetch,
    version: 2,
    chains: [CHAIN.ARBITRUM],
    start: '2024-07-22',
    methodology,
    allowNegativeValue: true //withdrawals could exceed deposits on a particular day
}

export default adapter;