import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL, { httpPost } from "../../utils/fetchURL";
import { sleep } from "../../utils/utils";
import { getEnv } from "../../helpers/env";
import { encodeBase58 } from "ethers";
import { METRIC } from "../../helpers/metrics";

function extractPubkey(base64Data: string, offset: number): string {
    const buffer = Buffer.from(base64Data, 'base64');
    const pubkeyBytes = new Uint8Array(buffer.slice(offset, offset + 32));
    return encodeBase58(pubkeyBytes);
}

const METEORA_DLMM_PROGRAM_ID = "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo";
const PRESTOCKS_LP_WALLET = "AuDS1jWvD2StHgkFfFUYaxa4rKQCjAqGayNSC1feixrV";

async function getMeteoraDLMMPositions(owner: string) {
    const response = await httpPost(getEnv('SOLANA_RPC'), {
        jsonrpc: "2.0",
        id: 1,
        method: "getProgramAccounts",
        params: [
            METEORA_DLMM_PROGRAM_ID,
            {
                encoding: "base64",
                filters: [
                    {
                        memcmp: {
                            offset: 40,
                            bytes: owner
                        }
                    }
                ]
            }
        ]
    });

    const accounts = response?.result || [];
    return accounts.map((acc: any) => extractPubkey(acc.account.data[0], 8));
}

async function fetch(_a: any, _b: any, options: FetchOptions) {
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