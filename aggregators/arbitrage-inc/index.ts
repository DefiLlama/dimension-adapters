import type { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

// Fee receiver collects 0.1% dev fee on every swap
const FEE_RECEIVER = '0xafF5340ECFaf7ce049261cff193f5FED6BDF04E7';
const FEE_RATE = 0.001; // 0.1%

// Known router/aggregator contracts that route swaps through Arbitrage Inc frontend.
// Fee transfers to FEE_RECEIVER originate from these sources only.
const ROUTERS = [
    '0x10ED43C718714eb63d5aA57B78B54704E256024E', // PancakeSwap V2 Router
    '0x1b81D678ffb9C0263b24A97847620C99d213eB14', // KyberSwap Elastic Router (BSC)
    '0x6131B5fae19EA4f9D964eAc0408E4408b66337b5', // KyberSwap Meta Aggregation Router v2
];

const fetch = async (options: FetchOptions) => {
    const dailyVolume = options.createBalances();

    try {
        const dailyFees = await addTokensReceived({
            options,
            targets: [FEE_RECEIVER],
            fromAddresses: ROUTERS,
        });

        // Volume estimated from fees: volume = fee_amount / fee_rate
        dailyVolume.addBalances(dailyFees);
        dailyVolume.resizeBy(1 / FEE_RATE);
    } catch (error) {
        const msg = String(error);
        // Recover gracefully from transient chain/indexer failures
        if (/indexer|rpc|timeout|rate.?limit/i.test(msg)) {
            console.error("[arbitrage-inc] recoverable fetch failure on bsc:", error);
        } else {
            throw error; // rethrow unexpected/system errors
        }
    }

    return { dailyVolume };
};

const adapter: Adapter = {
    version: 2,
    pullHourly: true,
    chains: [CHAIN.BSC],
    fetch,
    start: '2026-03-23',
    methodology: {
        Volume: "Trading volume routed through Arbitrage Inc aggregator on BNB Smart Chain, estimated from the 0.1% dev fee collected at the fee receiver address. Only transfers originating from known router contracts are counted.",
    },
};

export default adapter;
