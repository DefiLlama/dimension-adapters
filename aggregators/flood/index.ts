import { FetchResult } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { fetchURLWithRetry } from "../../helpers/duneRequest";

const chainsMap: Record<string, string> = {
    ARBITRUM: "arbitrum",
};
interface Row {
    Cum_Surplus: number;
    Cum_Trades: number;
    Cum_offer_amount_usd: number;
    Day: string;
    Nb_Trades: number;
    Surplus: number;
    sum_offer_amount_usd: number;
}
interface FloodQueryResult {
    result: {
        rows: Row[];
    };
}

const fetch =
    (chain: string) =>
        async (_: number): Promise<FetchResult> => {
            const unixTimestamp = getUniqStartOfTodayTimestamp();

            if (chain !== "arbitrum") {
                console.error("Flood aggregator supports only Arbitrum at the moment.");
                return {
                    dailyVolume: "0",
                    timestamp: unixTimestamp,
                };
            }

            try {
                const data = (
                    await fetchURLWithRetry(
                        `https://api.dune.com/api/v1/query/3290572/results`
                    )
                ).data as FloodQueryResult;
                const dayData = data.result.rows.find(r => getUniqStartOfTodayTimestamp(new Date(r.Day)) === unixTimestamp);

                if (!dayData) {
                    return {
                        dailyVolume: "0",
                        timestamp: unixTimestamp,
                    };
                }
                return {
                    dailyVolume: dayData.sum_offer_amount_usd.toString(),
                    timestamp: unixTimestamp,
                };
            } catch (e) {
                return {
                    dailyVolume: "0",
                    timestamp: unixTimestamp,
                };
            }
        };

const adapter: any = {
    adapter: {
        ...Object.values(chainsMap).reduce((acc, chain) => {
            return {
                ...acc,
                [(chainsMap as any)[chain] || chain]: {
                    fetch: fetch(chain),
                    start: async () => 1704067200,
                },
            };
        }, {}),
    },
};

export default adapter;
