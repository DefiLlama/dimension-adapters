import fetchURL from "../../utils/fetchURL"
import type { SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

type TMarket = {
    volumeUsd24h: number;
}

type TVolume = {
    volume_usd24h: number;
}

const fetch = (chain: string) => async (timestamp: number) => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
    const { markets }: { markets: TMarket[] } = (await fetchURL(`https://prod.clober-api.com/${chain}/markets`)).data;
    let dailyVolume = markets.map(market => market.volumeUsd24h).reduce((acc, cur) => acc + cur, 0)
    if (chain === '1101') {
        const {result}: {result: TVolume} = (await fetchURL(`https://pathfinder.clober-api.com/status`)).data;
        dailyVolume += result.volume_usd24h;
    }
    return {
        dailyVolume: `${dailyVolume}`,
        timestamp: dayTimestamp,
    };
};

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch: fetch('1'),
            runAtCurrTime: true,
            start: async () => 1683331200,
        },
        [CHAIN.POLYGON]: {
            fetch: fetch('137'),
            runAtCurrTime: true,
            start: async () => 1683331200,
        },
        [CHAIN.ARBITRUM]: {
            fetch: fetch('42161'),
            runAtCurrTime: true,
            start: async () => 1683331200,
        },
        [CHAIN.POLYGON_ZKEVM]: {
            fetch: fetch('1101'),
            runAtCurrTime: true,
            start: async () => 1683331200,
        },
    }
};

export default adapter;
