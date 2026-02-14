import { Dependencies, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../../helpers/dune";
import { FetchOptions } from "../../adapters/types";
import { METRIC } from "../../helpers/metrics";

interface IData {
    quote_mint: string;
    total_volume: number;
    total_trading_fees: number;
    total_protocol_fees: number;
    total_referral_fees: number;
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const query = getSqlFromFile('helpers/queries/dbc.sql', {
        tx_signer: '5qWya6UjwWnGVhdSBL3hyZ7B45jbk6Byt1hwd7ohEGXE',
        start: options.startTimestamp,
        end: options.endTimestamp
    })

    const data: IData[] = await queryDuneSql(options, query)

    const dailyFees = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();
    const dailyProtocolRevenue = options.createBalances();

    data.forEach(row => {
        dailyFees.add(row.quote_mint, Number(row.total_trading_fees), METRIC.TRADING_FEES);
        dailyFees.add(row.quote_mint, Number(row.total_protocol_fees), METRIC.PROTOCOL_FEES);
        dailyFees.add(row.quote_mint, Number(row.total_referral_fees), 'Referral fees');

        dailyProtocolRevenue.add(row.quote_mint, Number(row.total_trading_fees), METRIC.TRADING_FEES);
        dailyProtocolRevenue.add(row.quote_mint, Number(row.total_protocol_fees), METRIC.PROTOCOL_FEES);

        dailySupplySideRevenue.add(row.quote_mint, Number(row.total_referral_fees), 'Referral fees');
    });

    return {
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue: dailyProtocolRevenue,
        dailyProtocolRevenue,
        dailySupplySideRevenue,
    };
};


const breakdownMethodology = {
    Fees: {
        [METRIC.TRADING_FEES]: 'Trading fees charged to users for executing trades on the Believe protocol',
        [METRIC.PROTOCOL_FEES]: 'Additional protocol fees charged on trades, retained by the protocol',
        'Referral fees': 'Fees paid to referrers who bring users to the platform, used as trading rebates or incentives',
    },
    Revenue: {
        [METRIC.TRADING_FEES]: 'Trading fees retained by the Believe protocol',
        [METRIC.PROTOCOL_FEES]: 'Protocol fees retained by the Believe protocol',
    },
    ProtocolRevenue: {
        [METRIC.TRADING_FEES]: 'Trading fees retained by the Believe protocol',
        [METRIC.PROTOCOL_FEES]: 'Protocol fees retained by the Believe protocol',
    },
    SupplySideRevenue: {
        'Referral fees': 'Fees distributed to referrers as incentives for user acquisition',
    },
};

const adapter: SimpleAdapter = {
    version: 1,
    dependencies: [Dependencies.DUNE],
    fetch,
    chains: [CHAIN.SOLANA],
    start: '2025-04-27',
    isExpensiveAdapter: true,
    methodology: {
        Fees: "Trading fees paid by users.",
        Revenue: "Fees collected by Believe protocol.",
        ProtocolRevenue: "Fees collected by Believe protocol.",
        SupplySideRevenue: "Fees collected by referrals.",
    },
    breakdownMethodology,
}

export default adapter
