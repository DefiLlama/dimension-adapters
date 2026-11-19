

import { FetchOptions } from "../adapters/types";
import { CHAIN } from "./chains";
import coreAssets from "./coreAssets.json";
import { addTokensReceived } from './token';

const USDC = {
    [CHAIN.ETHEREUM]: coreAssets.ethereum.USDC,
    [CHAIN.POLYGON]: coreAssets.polygon.USDC_CIRCLE,
    [CHAIN.BASE]: coreAssets.base.USDC,
} as any

// excludeTxHashes: transfers that are not payments, e.g. the merchant bridging its own balance between chains
export function generateCBCommerceExports(receivingAddress:string, excludeTxHashes: string[] = []) {
    const excluded = new Set(excludeTxHashes.map(h => h.toLowerCase()))
    const logFilter = excluded.size ? (log: any) => !excluded.has(String(log.transactionHash).toLowerCase()) : undefined
    const receivedOnEVMChain = async (options: FetchOptions) => {
        const dailyFees = await addTokensReceived({ options, tokens: [USDC[options.chain]], target: receivingAddress, logFilter })
        return {
            dailyFees,
            dailyRevenue: dailyFees,
            dailyProtocolRevenue: dailyFees,
        }
    }

    return [CHAIN.ETHEREUM, CHAIN.BASE, CHAIN.POLYGON].reduce((all, chain) => ({
        ...all,
        [chain]: {
            fetch: receivedOnEVMChain,
        }
    }), {})
}