import fetchURL from "../../utils/fetchURL"
import type { SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

type TMarket = {
    volumeUsd24h: number;
    accumulatedVolumeUsd: number;
}

type TVolume = {
    volume_usd24h: number;
    accumulated_volume_usd: number;
}

const fetch = (chain: string) => async (timestamp: number) => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
    const { markets }: { markets: TMarket[] } = (await fetchURL(`https://prod.clober-api.com/${chain}/markets`));
    let dailyVolume = markets.map(market => market.volumeUsd24h).reduce((acc, cur) => acc + cur, 0)
    if (chain === '1101') {
        const {result}: {result: TVolume} = (await fetchURL(`https://pathfinder.clober-api.com/status`));
        dailyVolume += result.volume_usd24h;
    }
    return {
        dailyVolume: dailyVolume,
        timestamp: dayTimestamp,
    };
};

const adapter: SimpleAdapter = {
    deadFrom: '2023-11-23',
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch: fetch('1'),
            runAtCurrTime: true,
            start: '2023-05-06',
        },
        [CHAIN.POLYGON]: {
            fetch: fetch('137'),
            runAtCurrTime: true,
            start: '2023-05-06',
        },
        [CHAIN.ARBITRUM]: {
            fetch: fetch('42161'),
            runAtCurrTime: true,
            start: '2023-05-06',
        },
        [CHAIN.POLYGON_ZKEVM]: {
            fetch: fetch('1101'),
            runAtCurrTime: true,
            start: '2023-05-06',
        },
    }
};

export default adapter;
