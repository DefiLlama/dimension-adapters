

import { FetchOptions } from "../adapters/types";
import { CHAIN } from "./chains";
import coreAssets from "./coreAssets.json";
import { addTokensReceived } from './token';

const USDC = {
    [CHAIN.ETHEREUM]: coreAssets.ethereum.USDC,
    [CHAIN.POLYGON]: coreAssets.polygon.USDC_CIRCLE,
    [CHAIN.BASE]: coreAssets.base.USDC,
} as any

export function generateCBCommerceExports(receivingAddress:string) {
    const receivedOnEVMChain = async (options: FetchOptions) => {
        const dailyFees = await addTokensReceived({ options, tokens: [USDC[options.chain]], target: receivingAddress })
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