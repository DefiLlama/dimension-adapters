import { Dependencies, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../helpers/dune";
import { FetchOptions } from "../adapters/types";

interface IData {
    quote_mint: string;
    total_volume: number;
    total_trading_fees: number;
    total_protocol_fees: number;
    total_referral_fees: number;
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const query = getSqlFromFile('helpers/queries/dbc.sql', {
        tx_signer: '7rtiKSUDLBm59b1SBmD9oajcP8xE64vAGSMbAN5CXy1q',
        start: options.startTimestamp,
        end: options.endTimestamp
    })
    const data: IData[] = await queryDuneSql(options, query)
    const dailyFees = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();
    const dailyProtocolRevenue = options.createBalances();
    data.forEach(row => {
        dailyFees.add(row.quote_mint, Number(row.total_trading_fees), 'Trading Fees');
        dailyFees.add(row.quote_mint, Number(row.total_protocol_fees), 'Protocol Fees');
        dailyFees.add(row.quote_mint, Number(row.total_referral_fees), 'Referral Fees');
        dailySupplySideRevenue.add(row.quote_mint, Number(row.total_referral_fees), 'Referral Fees');
        dailyProtocolRevenue.add(row.quote_mint, Number(row.total_protocol_fees), 'Protocol Fees');
        dailyProtocolRevenue.add(row.quote_mint, Number(row.total_trading_fees), 'Trading Fees');
    });

    return {
        dailyFees,
        dailyUserFees: dailyFees,
        dailySupplySideRevenue,
        dailyRevenue: dailyProtocolRevenue,
        dailyProtocolRevenue,
    };
};


const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    chains: [CHAIN.SOLANA],
    start: '2025-06-26',
    dependencies: [Dependencies.DUNE],
    isExpensiveAdapter: true,
    methodology: {
        Fees: "All fees collected from token trading on Moonshot, including trading fees, protocol fees, and referral fees.",
        SupplySideRevenue: "Referral fees distributed to referrers.",
        Revenue: "Trading fees and protocol fees collected by Moonshot protocol.",
        ProtocolRevenue: "Trading fees and protocol fees collected by Moonshot protocol.",
    },
    breakdownMethodology: {
        Fees: {
            'Trading Fees': 'Fees charged on each token trade, collected by the protocol',
            'Protocol Fees': 'Additional protocol fees charged on trades',
            'Referral Fees': 'Fees distributed to referrers who brought users to the platform',
        },
        Revenue: {
            'Trading Fees': 'Fees charged on each token trade, collected by the protocol',
            'Protocol Fees': 'Additional protocol fees charged on trades',
        },
        ProtocolRevenue: {
            'Trading Fees': 'Fees charged on each token trade, collected by the protocol',
            'Protocol Fees': 'Additional protocol fees charged on trades',
        },
        SupplySideRevenue: {
            'Referral Fees': 'Fees distributed to referrers who brought users to the platform',
        },
    }
}

export default adapter
