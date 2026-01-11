import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const MetricLabels = {
    CASH_TRANSACTION_FEES: 'Cash Transaction Fees',
    CASHBACKS: 'Cashbacks'
};

const config = {
    "cashSpends": [
        {
            eventAbi: "event Spend (address indexed userSafe, address indexed token, uint256 amount, uint256 amountInUsd, uint8 mode)",
            targets: ["0x5423885B376eBb4e6104b8Ab1A908D350F6A162e", "0x380B2e96799405be6e3D965f4044099891881acB"]
        },
        {
            eventAbi: "event Spend (address indexed safe,bytes32 indexed txId, address indexed token, uint256 amount, uint256 amountInUsd, uint8 mode)",
            targets: ["0x380B2e96799405be6e3D965f4044099891881acB"]
        },
        {
            eventAbi: "event Spend (address indexed safe, bytes32 indexed txId,uint8 indexed binSponsor, address[] tokens, uint256[] amounts, uint256[] amountInUsd, uint256 totalUsdAmt, uint8 mode)",
            targets: ["0x380B2e96799405be6e3D965f4044099891881acB"]
        },
    ],
    "cashBacks": [
        {
            eventAbi: "event Cashback (address indexed userSafe, uint256 spendingInUsd, address indexed cashbackToken, uint256 cashbackAmount, uint256 cashbackInUsd, bool paid)",
            targets: ["0x5423885B376eBb4e6104b8Ab1A908D350F6A162e"]
        },
        {
            eventAbi: "event Cashback (address indexed safe,address indexed spender, uint256 spendingInUsd, address cashbackToken, uint256 cashbackAmountToSafe, uint256 cashbackInUsdToSafe, uint256 cashbackAmountToSpender, uint256 cashbackInUsdToSpender, bool indexed paid)",
            targets: ["0x380B2e96799405be6e3D965f4044099891881acB"]
        },
        {
            eventAbi: "event Cashback (address indexed safe, uint256 spendingInUsd, address indexed recipient, address cashbackToken, uint256 cashbackAmountInToken, uint256 cashbackInUsd, uint8 cashbackType, bool indexed paid)",
            targets: ["0x380B2e96799405be6e3D965f4044099891881acB"]
        },
        {
            eventAbi: "event Cashback (address indexed safe, uint256 spendingInUsd, address indexed recipient, address cashbackToken, uint256 cashbackAmountInToken, uint256 cashbackInUsd, uint256 cashbackType, bool indexed paid)",
            targets: ["0x380B2e96799405be6e3D965f4044099891881acB"]
        },
    ]
};

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    for (const { eventAbi, targets } of config.cashSpends) {
        const logs = await options.getLogs({
            eventAbi,
            targets
        });
        logs.forEach(log => {
            for (const amount of log.amountInUsd) {
                if (amount > 0) {
                    //Cash transaction fees(1.38 % on card spends) - protocol revenue
                    dailyFees.addUSDValue(Number(amount) * 0.0138 / 1e6, MetricLabels.CASH_TRANSACTION_FEES);
                    dailyRevenue.addUSDValue(Number(amount) * 0.0138 / 1e6, MetricLabels.CASH_TRANSACTION_FEES);
                }
            }
        })
    }
    for (const { eventAbi, targets } of config.cashBacks) {
        const logs = await options.getLogs({
            eventAbi,
            targets
        });
        logs.forEach(log => {
            if (log.cashbackInUsd > 0) {
                dailyFees.addUSDValue(Number(log.cashbackInUsd) / 1e6, MetricLabels.CASHBACKS);
                dailySupplySideRevenue.addUSDValue(Number(log.cashbackInUsd) / 1e6, MetricLabels.CASHBACKS);
            }
        })
    }

    return {
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
        dailySupplySideRevenue,
    };
};

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    chains: [CHAIN.SCROLL],
    start: '2024-11-01',
    methodology: {
        Fees: "Total fees generated from EtherFi Cash services on Scroll including transaction fees and cashbacks.",
        Revenue: "Protocol's share of fees from EtherFi Cash operations including transaction fees",
        ProtocolRevenue: "Same as Revenue - all protocol earnings from EtherFi Cash on Scroll.",
        SupplySideRevenue: "Cashback rewards paid to users by external providers.",
    },
    breakdownMethodology: {
        Fees: {
            [MetricLabels.CASH_TRANSACTION_FEES]: '1.38% transaction fees from EtherFi Cash card usage on Scroll',
            [MetricLabels.CASHBACKS]: 'Cashback rewards paid to card users by external providers on Scroll',
        },
        Revenue: {
            [MetricLabels.CASH_TRANSACTION_FEES]: '1.38% transaction fees from EtherFi Cash card usage on Scroll',
        },
        SupplySideRevenue: {
            [MetricLabels.CASHBACKS]: 'Cashback rewards paid to card users by external providers on Scroll',
        },
    }
};

export default adapter;