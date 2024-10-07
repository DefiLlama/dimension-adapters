import { SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { httpGet } from "../../utils/fetchURL";

const feesEndpoint = "https://data.wisetoken.net/WISE/globals/fees.json";

interface IFeeResponse {
    totals: {
        totalFeeTokensUSD: number;
    };
    tokens: {
        [key: string]: { feeTokensUSD: number };
    };
}

const fetch = () => {
    return async (timestamp: number) => {
        const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
        const fees: IFeeResponse = await httpGet(feesEndpoint);

        return {
            dailyFees: `${fees?.totals.totalFeeTokensUSD || undefined}`,
            timestamp: dayTimestamp,
        };
    };
};

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        ["arbitrum"]: {
            fetch: fetch(),
            runAtCurrTime: true,
            start: 1727740800,
        },
    },
};

export default adapter;
