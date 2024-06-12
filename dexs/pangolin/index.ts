import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

export default univ2Adapter({
    "avax": `https://gateway-arbitrum.network.thegraph.com/api/${process.env.GRAPH_PROTOCOL}/subgraphs/id/CPXTDcwh6tVP88QvFWW7pdvZJsCN4hSnfMmYeF1sxCLq`
}, {
    factoriesName: "pangolinFactories",
    dayData: "pangolinDayData",
});
