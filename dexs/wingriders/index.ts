import { Adapter, ChainBlocks, FetchOptions } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains";
import { httpPost } from "../../utils/fetchURL";

const volUrl = 'https://aggregator.mainnet.wingriders.com/volumeInAda';

async function fetchVolume(timestamp: number , _: ChainBlocks, { createBalances }: FetchOptions) {
    const dailyVolume = createBalances()
    const last24hVolInAda = await httpPost(volUrl, { "lastNHours": 24 });
    // const totalVolumeInAda = await httpPost(volUrl, {});
    dailyVolume.addGasToken(last24hVolInAda * 1e6);
    return {
        dailyVolume,
        timestamp
    }
}

export default {
    adapter: {
        [CHAIN.CARDANO]: {
            fetch: fetchVolume,
            runAtCurrTime: true,
            start: 0,
        }
    }
} as Adapter
