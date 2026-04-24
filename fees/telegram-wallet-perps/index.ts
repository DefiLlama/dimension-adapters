import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

const LIGHTER_BASE_URL = 'https://mainnet.zklighter.elliot.ai/api/v1/partnerStats';
const TELEGRAM_WALLET_ACCOUNT_INDEX = '281474976617487';

async function fetch(_a: any, _b: any, options: FetchOptions) {
    const dailyFees = options.createBalances();

    const response = await fetchURL(`${LIGHTER_BASE_URL}?account_index=${TELEGRAM_WALLET_ACCOUNT_INDEX}&start_timestamp=${options.startTimestamp * 1000}&end_timestamp=${options.endTimestamp * 1000}`);

    dailyFees.addUSDValue(Number(response.total_fees_earned), 'Partner Fees');

    return {
        dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees,
    }
}

const methodology = {
    Fees: 'Partner fees earned by telegram wallet through lighter perps integration',
    Revenue: 'Partner fees earned by telegram wallet through lighter perps integration',
    ProtocolRevenue: 'Partner fees earned by telegram wallet through lighter perps integration',
}

const breakdownMethodology = {
    Fees: {
        'Partner Fees': 'Partner fees earned by telegram wallet through lighter perps integration',
    },
    Revenue: {
        'Partner Fees': 'Partner fees earned by telegram wallet through lighter perps integration',
    },
    ProtocolRevenue: {
        'Partner Fees': 'Partner fees earned by telegram wallet through lighter perps integration',
    },
}

const adapter: SimpleAdapter = {
    fetch,
    chains: [CHAIN.ZK_LIGHTER],
    start: '2026-04-01',
    methodology,
    breakdownMethodology,
}

export default adapter;