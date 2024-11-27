import { Chain } from "@defillama/sdk/build/general";
import { FetchResult, FetchResultV2, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import customBackfill from "../../helpers/customBackfill";
import fetchURL from "../../utils/fetchURL";
import { getTimestampAtStartOfPreviousDayUTC } from "../../utils/date";

let abi = ["event Swap(address indexed payer,address indexed payee,address fromToken,address toToken,uint fromAmount,uint receivedAmount)"];
let knownTokens = new Set(["0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", "0x55d398326f99059fF775485246999027B3197955", "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d"]);
type IContract = {
    [c: string | Chain]: string;
};

const contract: IContract = {
    [CHAIN.BSC]: '0xfCD555b55AA785d46E8c6e9bBB109b10602c431c',
    [CHAIN.POLYGON]:'0x464599BDaC77E8e5843D5BbC531EC8aD75d3F7b1',
    [CHAIN.ETHEREUM]:'0x9556E8ce70ceA3c43e4A6c17ad2FAb258067b058',
    [CHAIN.BASE]:'0x334F493613c1dD33a364684802fB9C728dfcE1A5',
    [CHAIN.OP_BNB]:'0x8A3e34e45b76885001aa024d6F35FBAcfDBd9DB0'

};
const bscStatsApi = "https://public.udex.one/bsc/indexer/56/udex/daliyVolume?";//return max 24 hour volume
const fetch: FetchV2 = async ({ getLogs, createBalances, chain,fromTimestamp, toTimestamp }): Promise<FetchResultV2> => {
    const dailyVolume = createBalances();
    const reqUrl=bscStatsApi+`from_timestamp=${fromTimestamp}&to_timestamp=${toTimestamp}`
    console.log(reqUrl)
    if (chain == CHAIN.BSC) {
        let data = await fetchURL(reqUrl);
        console.log("data",data)
        if (data.data) {
            return { dailyVolume: data.data};
        }
        return { dailyVolume: 0 };
    } else {
        const logs = (await getLogs({ target: contract[chain], eventAbi: abi[0] }));
        logs.map((log: any) => {
            if (knownTokens.has(log.toToken)) {
                dailyVolume.add(log.toToken, log.receivedAmount);
            } else {
                dailyVolume.add(log.fromToken, log.fromAmount);
            }
        });
        return { dailyVolume };
    }

};


const adapter: SimpleAdapter = {
    adapter: Object.keys(contract).reduce((acc, chain) => {
        return {
            ...acc,
            [chain]: {
                fetch,
                start: 1724889600,
                runAtCurrTime: false
            },
        };
    }, {}),
    version: 2,
};
export default adapter;