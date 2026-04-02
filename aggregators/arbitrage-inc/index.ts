import type { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

const FEE_RECEIVER = '0xafF5340ECFaf7ce049261cff193f5FED6BDF04E7';
const FEE_RATE = 0.001; // 0.1% dev fee on every swap

const fetch = async (options: FetchOptions) => {
    const dailyFees = await addTokensReceived({
        options,
        targets: [FEE_RECEIVER],
    });

    // Volume is estimated from collected fees: volume = fees / fee_rate
    const dailyVolume = options.createBalances();
    dailyVolume.addBalances(dailyFees);
    dailyVolume.resizeBy(1 / FEE_RATE);

    return {
        dailyVolume,
    };
};

const adapter: Adapter = {
    version: 2,
    pullHourly: true,
    chains: [CHAIN.BSC],
    fetch,
    start: '2026-03-23',
    methodology: {
        Volume: "Trading volume routed through Arbitrage Inception aggregator on BNB Smart Chain, estimated from the 0.1% dev fee collected at the fee receiver address.",
    },
};

export default adapter;
