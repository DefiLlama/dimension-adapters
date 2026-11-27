import { id, zeroPadValue } from "ethers";
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const AETHIR_CORE = "0x226DC7D2AA1F9a565e82faf04772FDbBaF2da42d";
const AETHIR_TOKEN = "0xc87B37a581ec3257B734886d9d3a581F5A9d056c";

// https://aethir.com/blog-posts/aethir-tokenomics-update-ath-burns-dashboard-go-live
const SERVICE_FEE_BURNER = "0xf8ec8e8ecdbfbba4d073090152dfc6559c7ef531";
const BURN_ADDRESS = "0x000000000000000000000000000000000000dead";
const SERVICE_FEE_BURNS = "Service Fee Burns";

const DEPOSIT_SERVICE_FEE_EVENT = "event DepositServiceFee (address indexed developer, uint64 nonce, uint256 amount)";

const WITHDRAW_SERVICE_FEE_EVENT = "event WithdrawServiceFee (address indexed developer, uint64 nonce, uint256 amount)";

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
    const dailyFees = options.createBalances();
    const dailyHoldersRevenue = options.createBalances();

    const serviceFeeDepositLogs = await options.getLogs({
        eventAbi: DEPOSIT_SERVICE_FEE_EVENT,
        target: AETHIR_CORE
    });

    const serviceFeeWithdrawalLogs = await options.getLogs({
        eventAbi: WITHDRAW_SERVICE_FEE_EVENT,
        target: AETHIR_CORE
    });

    serviceFeeDepositLogs.forEach((deposit: any) => dailyFees.add(AETHIR_TOKEN, deposit.amount, METRIC.SERVICE_FEES));

    serviceFeeWithdrawalLogs.forEach((withdraw: any) => dailyFees.subtractToken(AETHIR_TOKEN, withdraw.amount, METRIC.SERVICE_FEES));

    const burnLogs = await options.getLogs({
        target: AETHIR_TOKEN,
        eventAbi: "event Transfer(address indexed from, address indexed to, uint256 amount)",
        topics: [
            id("Transfer(address,address,uint256)"),
            zeroPadValue(SERVICE_FEE_BURNER, 32),
            zeroPadValue(BURN_ADDRESS, 32),
        ],
    });
    for (const burn of burnLogs) dailyHoldersRevenue.add(AETHIR_TOKEN, burn.amount, SERVICE_FEE_BURNS);

    const dailyRevenue = dailyFees.clone(0.2);

    return {
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
        dailySupplySideRevenue: dailyFees.clone(0.8, METRIC.OPERATORS_FEES),
        dailyHoldersRevenue,
    }
}

const methodology = {
    Fees: "Service fees paid by developers to use aethir GPU services",
    Revenue: "20% protocol fees charged by aethir",
    ProtocolRevenue: "Protocol fees at collection, before any subsequent burns",
    HoldersRevenue: "ATH burned from collected service fees, recorded when the burn executes",
    SupplySideRevenue: "80% of the service fees goes to GPU service providers"
};

const breakdownMethodology = {
    Fees: {
        [METRIC.SERVICE_FEES]: "Service fees paid by developers for GPU compute resources on the Aethir network"
    },
    Revenue: {
        [METRIC.PROTOCOL_FEES]: "20% of service fees retained by Aethir protocol"
    },
    HoldersRevenue: {
        [SERVICE_FEE_BURNS]: "ATH transferred from Aethir's service fee burner to the burn address"
    },
    SupplySideRevenue: {
        [METRIC.OPERATORS_FEES]: "80% of service fees distributed to GPU service providers (operators) who supply compute resources"
    }
};

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: [CHAIN.ARBITRUM],
    start: '2024-07-22',
    methodology,
    breakdownMethodology,
    allowNegativeValue: true // withdrawals could exceed deposits on a particular day
}

export default adapter;
