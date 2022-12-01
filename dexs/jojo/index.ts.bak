import {ChainBlocks, SimpleAdapter} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import {gql, request} from "graphql-request";
import {getBlock} from "../../helpers/getBlock";
import {
    getUniqStartOfTodayTimestamp
} from "../../helpers/getUniSubgraphVolume";
import {Chain} from "@defillama/sdk/build/general";
const DEFAULT_DAILY_VOLUME_FACTORY = "dailyVolume";
const DEFAULT_DAILY_DATE_FIELD = "date";
const DEFAULT_DAILY_VOLUME_FIELD = "dailyVolume";
const DEFAULT_TOTAL_VOLUME_FACTORY = "jojodealers";
const DEFAULT_TOTAL_VOLUME_FIELD = "totalVolumeUSD";
const endpoints = {
    [CHAIN.BSC]: "https://api.thegraph.com/subgraphs/name/kittyfu307/jojov1",
};
interface IGetChainVolumeParams2 {
    graphUrls: {
        [chains: string]: string
    },
    totalVolume: {
        factory: string,
        field: string
    },
    dailyVolume?: {
        factory: string,
        field: string,
        dateField?: string,
    },
    customDailyVolume?: string,
    hasDailyVolume?: boolean
    hasTotalVolume?: boolean
    getCustomBlock?: (timestamp: number) => Promise<number>
}

const getDateId = (date?: Date) => getUniqStartOfTodayTimestamp(date) / 86400;
function getChainVolume({
                            graphUrls,
                            totalVolume,
                            dailyVolume = {
                                factory: DEFAULT_DAILY_VOLUME_FACTORY,
                                field: DEFAULT_DAILY_VOLUME_FIELD,
                                dateField: DEFAULT_DAILY_DATE_FIELD
                            },
                            customDailyVolume = undefined,
                            hasDailyVolume = true,
                            hasTotalVolume = true,
                            getCustomBlock = undefined,
                        }: IGetChainVolumeParams2) {

    const dailyVolumeQuery =
        customDailyVolume ||
        gql`
            ${dailyVolume.factory} (id: $id) {
            ${dailyVolume.field}
            }`;
    const graphQueryDailyVolume = gql`${hasDailyVolume ? `query get_daily_volume($id: Int) { ${dailyVolumeQuery} }` : ""}`;
    const graphQueryTotalVolume = gql`${hasTotalVolume ? `query get_total_volume{jojodealers(first: 1){totalVolumeUSD}}` : ""}`

    return (chain: Chain) => {
        return async (timestamp: number, chainBlocks: ChainBlocks) => {
            const block =
                getCustomBlock ?
                    await getCustomBlock(timestamp) :
                    await getBlock(timestamp, chain, chainBlocks);
            const id = getDateId(new Date(timestamp * 1000));
            let graphResDaily = hasDailyVolume ?
                await request(graphUrls[chain], graphQueryDailyVolume, { id })
                    .catch(e => console.error(`Failed to get daily volume on ${chain}: ${e.message}`)) : undefined;

            const graphResTotal = hasTotalVolume ? await request(graphUrls[chain], graphQueryTotalVolume, { block }).catch(e => console.error(`Failed to get total volume on ${chain}: ${e.message}`)) : undefined;
            let dailyVolumeValue = graphResDaily ? graphResDaily[dailyVolume.factory]?.[dailyVolume.field] : undefined
            return {
                timestamp,
                block,
                totalVolume: graphResTotal[totalVolume.factory][0]?.[totalVolume.field],
                dailyVolume: dailyVolumeValue,
            };
        };
    };
}
const graphs = getChainVolume(
    {graphUrls: endpoints,
        totalVolume: {
            factory: DEFAULT_TOTAL_VOLUME_FACTORY,
            field: DEFAULT_TOTAL_VOLUME_FIELD,
        }
    }
);
const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.BSC]: {
            fetch: graphs(CHAIN.BSC),
            start: async () => 22088074,
        }
    }
}
export default adapter;