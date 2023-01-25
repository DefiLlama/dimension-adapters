import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getStartTimestamp } from "../../helpers/getStartTimestamp";
import { getGraphDimensions } from "../../helpers/getUniSubgraph";

const endpoints = {
    [CHAIN.TELOS]: "http://api.archly.fi/subgraphs/name/archly/amm",
};

const graphFetch = getGraphDimensions({
    graphUrls: endpoints,
    totalVolume: {
        factory: "factories"
    },
    dailyVolume: {
        factory: "dayData"
    },
    feesPercent: {
        type: 'volume',
        Fees: 0.3,
        UserFees: 0.3,
        HoldersRevenue: 0.3,
        Revenue: 0.3,
        SupplySideRevenue: 0,
        ProtocolRevenue: 0,
    }
});

const adapter: Adapter = {
    adapter: {
        [CHAIN.TELOS]: {
            fetch: graphFetch(CHAIN.TELOS),
            start: getStartTimestamp({
                endpoints: endpoints,
                chain: CHAIN.TELOS,
                dailyDataField: "dayDatas"
            }),
            meta: {
                methodology: {
                    Fees: "The trading fees are 0.03%, and can be adjusted from 0.01% up to 0.1%.",
                    UserFees: "Currently users pay a trading fee of 0.03%.",
                    HoldersRevenue: "veArc voters receive all protocol fees.",
                    Revenue: "All trading fees are paid to veArc voters.",
                    SupplySideRevenue: "LPs do not earn any revenue from trading fees, only Arc emission decided by veArc voters.",
                    ProtocolRevenue: "Treasury does not earn any revenue from trading fees."
                }
            }
        }
    }
};

export default adapter;