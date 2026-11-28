import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { addTokensReceived } from "../../helpers/token";

const AETHIR_CORE = "0x226DC7D2AA1F9a565e82faf04772FDbBaF2da42d";
const AETHIR_TOKEN = "0xc87B37a581ec3257B734886d9d3a581F5A9d056c";

// https://aethir.com/blog-posts/aethir-tokenomics-update-ath-burns-dashboard-go-live
const SERVICE_FEE_BURNER = "0xf8ec8e8ecdbfbba4d073090152dfc6559c7ef531";
const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";
const SERVICE_FEE_BURNS = "Service Fee Burns";

const DEPOSIT_SERVICE_FEE_EVENT = "event DepositServiceFee (address indexed developer, uint64 nonce, uint256 amount)";

const WITHDRAW_SERVICE_FEE_EVENT = "event WithdrawServiceFee (address indexed developer, uint64 nonce, uint256 amount)";

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
    const dailyFees = options.createBalances();

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

    const burns = await addTokensReceived({ options, token: AETHIR_TOKEN, fromAddressFilter: SERVICE_FEE_BURNER, target: BURN_ADDRESS });
    const dailyHoldersRevenue = options.createBalances();
    dailyHoldersRevenue.addBalances(burns, SERVICE_FEE_BURNS);

    const dailyRevenue = dailyFees.clone(0.2, METRIC.PROTOCOL_FEES);
    const dailyProtocolRevenue = dailyRevenue.clone();
    dailyProtocolRevenue.subtract(burns, METRIC.PROTOCOL_FEES);

    return {
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue,
        dailySupplySideRevenue: dailyFees.clone(0.8, METRIC.OPERATORS_FEES),
        dailyHoldersRevenue,
    }
}

const methodology = {
    Fees: "Service fees paid by developers to use aethir GPU services",
    Revenue: "20% protocol fees charged by aethir, including the share burned",
    ProtocolRevenue: "20% protocol fees charged by aethir, minus the ATH burned from service fees",
    HoldersRevenue: "ATH claimed from the service fee pool by Aethir's burn contract and sent to the burn address",
    SupplySideRevenue: "80% of the service fees goes to GPU service providers"
};

const breakdownMethodology = {
    Fees: {
        [METRIC.SERVICE_FEES]: "Service fees paid by developers for GPU compute resources on the Aethir network"
    },
    Revenue: {
        [METRIC.PROTOCOL_FEES]: "20% of service fees retained by Aethir protocol"
    },
    ProtocolRevenue: {
        [METRIC.PROTOCOL_FEES]: "20% of service fees retained by Aethir protocol, minus the ATH burned from service fees"
    },
    HoldersRevenue: {
        [SERVICE_FEE_BURNS]: "ATH claimed from the service fee pool by Aethir's burn contract and sent to the burn address"
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
    allowNegativeValue: true // withdrawals could exceed deposits on a particular day; burns can exceed same-day protocol revenue
}

export default adapter;
