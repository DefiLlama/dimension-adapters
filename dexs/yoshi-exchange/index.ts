import * as sdk from "@defillama/sdk";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.FANTOM]: sdk.graph.modifyEndpoint('EWBFCUSAd8eGb735UtAfsW99fNaEDAPnE2bbKWsRQLNt'),
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('Ap2c45H9tD4DqqcUYDACkv1zks7GC2WmoGq8QUgSVD81'),
  [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('CbpyZn3XuTwDtiWqw33cTxM4SQFB1vmtpYqyrkJ6v52S'),
};

export default univ2Adapter(endpoints, {
    factoriesName: "factories",
    dayData: "dayData",
    dailyVolume: "volumeUSD",
    totalVolume: "volumeUSD",
    gasToken: "coingecko:fantom"
});
