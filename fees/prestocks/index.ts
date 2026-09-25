import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { sleep } from "../../utils/utils";
import { METRIC } from "../../helpers/metrics";
import { extractPubkey, getProgramAccounts } from "../../helpers/solana";

const METEORA_DLMM_PROGRAM_ID = "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo";
const PRESTOCKS_LP_WALLET = "AuDS1jWvD2StHgkFfFUYaxa4rKQCjAqGayNSC1feixrV";

async function getMeteoraDLMMPositions(owner: string) {
    const accounts = await getProgramAccounts({
        programId: METEORA_DLMM_PROGRAM_ID,
        encoding: "base64",
        // slice only lbPair (offset 8, 32 bytes) — memcmp still runs on full data
        dataSlice: { offset: 8, length: 32 },
        filters: [{ memcmp: { offset: 40, bytes: owner } }],
    });

    // lbPair is at offset 0 of the sliced data
    return accounts.map((acc) => extractPubkey(acc.account.data[0], 0));
}

async function fetch(options: FetchOptions) {
    const dailyFees = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();
    const dailyRevenue = options.createBalances();

    const data = await getMeteoraDLMMPositions(PRESTOCKS_LP_WALLET);

    for (const poolId of data) {
        const poolData = await fetchURL(`https://dlmm.datapi.meteora.ag/pools/${poolId}/volume/history?start_time=${options.startOfDay}&end_time=${options.endTimestamp}`)
        const todaysData = poolData.data.find((data: any) => data.timestamp === options.startOfDay);

        if(!todaysData) {
            throw new Error(`No data found for ${options.startOfDay}`);
        }

        dailyFees.addUSDValue(todaysData.fees, METRIC.LP_FEES);
        dailySupplySideRevenue.addUSDValue(todaysData.protocol_fees, METRIC.PROTOCOL_FEES);
        dailyRevenue.addUSDValue(todaysData.fees - todaysData.protocol_fees, METRIC.LP_FEES);

        await sleep(500);
    }

    return {
        dailyFees,
        dailySupplySideRevenue, 
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
    };
}

const methodology = {
    Fees: "LP fees earned by providing liquidity to various PreStocks on Meteora DLMM.",
    Revenue: "Fees retained by the protocol after Meteora's cut. We ignore other liquidity providers, as they constitute approximately 0.5% of the total liquidity.",
    ProtocolRevenue: "All revenue goes to the protocol.",
    SupplySideRevenue: "Protocol fees charged by Meteora DLMM.",
}

const breakdownMethodology = {
    Fees: {
        [METRIC.LP_FEES]: "LP fees earned by providing liquidity to various PreStocks on Meteora DLMM.",
    },
    Revenue: {
        [METRIC.LP_FEES]: "LP fees earned by providing liquidity to various PreStocks on Meteora DLMM.",
    },
    ProtocolRevenue: {
        [METRIC.LP_FEES]: "LP fees earned by providing liquidity to various PreStocks on Meteora DLMM.",
    },
    SupplySideRevenue: {
        [METRIC.PROTOCOL_FEES]: "Protocol fees charged by Meteora DLMM.",
    },
}

const adapter: SimpleAdapter = {
    fetch,
    start: "2025-09-16",
    chains: [CHAIN.SOLANA],
    doublecounted: true, //Meteora
    methodology,
    breakdownMethodology,
}

export default adapter;