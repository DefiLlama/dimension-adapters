import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

const superpositionRouter = "0x0b7250866f0b014E6983cACc5b854EeA7a3d9188"

async function fetch(options: FetchOptions) {
    const dailyVolume = options.createBalances()
    await addTokensReceived({ options: options, target: superpositionRouter, balances: dailyVolume})
    return {
        dailyVolume,
    }
}

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    chains: [CHAIN.ETHEREUM],
    start: "2025-11-04"
}

export default adapter