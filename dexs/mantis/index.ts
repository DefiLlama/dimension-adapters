import { Chain } from "@defillama/sdk/build/general";
import { Adapter, ChainBlocks, FetchOptions, FetchResult, ProtocolType } from "../../adapters/types";
import { CHAIN } from '../../helpers/chains';
import fetchURL from "../../utils/fetchURL"

const MANTIS_INDEXER_API = `https://mantis-indexer.composable-shared-artifacts.composablenodes.tech`;
const MANTIS_VOLUME_API = `${MANTIS_INDEXER_API}/api/domain/getvolume`;

const fetch = (chain: Chain) => async (timestamp: number, _: ChainBlocks, options: FetchOptions): Promise<FetchResult> => {
    const urlDaily = `${MANTIS_VOLUME_API}?timestamp=${options.toTimestamp}&chain=${chain == CHAIN.ETHEREUM ? 1 : 2}&period=1&solved_only=true`;
    const urlTotal = `${MANTIS_VOLUME_API}?timestamp=${options.toTimestamp}&chain=${chain == CHAIN.ETHEREUM ? 1 : 2}&period=0&solved_only=true`;

    const volumeDaily = (await fetchURL(urlDaily)).assets;
    const volumeTotal = (await fetchURL(urlTotal)).assets;

    const dailyVolume = options.createBalances();
    const totalVolume = options.createBalances();

    Object.entries(volumeDaily)?.forEach(([key, val]) => {
        const k = key.replace(`${chain}:`, '');

        if (k != '' || k != null) {
            dailyVolume.add(k, val);
        }
    });

    Object.entries(volumeTotal)?.forEach(([key, val]) => {
        const k = key.replace(`${chain}:`, '');

        if (k != '' && k != null) {
            totalVolume.add(k, val);
        }

    });

    return {
        dailyVolume,
        totalVolume,
        timestamp
    };
};

export default {
    adapter: {
        [CHAIN.SOLANA]: {
            fetch: fetch(CHAIN.SOLANA),
            start: 1732993200,
            meta: {
                methodology: "Sum of all executed intents with Solana as input or output",
            },
        },
        [CHAIN.ETHEREUM]: {
            fetch: fetch(CHAIN.ETHEREUM),
            start: 1732993200,
            meta: {
                methodology: "Sum of all executed intents with Ethereum as input or output",
            },
        }
    },
    protocolType: ProtocolType.PROTOCOL,
    isExpensiveAdapter: true,
    timetravel: false,
} as Adapter;
