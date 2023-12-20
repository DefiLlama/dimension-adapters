import { MarketInfo} from "./types";
import fetchURL from "../../utils/fetchURL";
import { Chain, queryContract } from "./utils";

const factories:Record<Chain, string> = {
    osmosis: "osmo1ssw6x553kzqher0earlkwlxasfm2stnl3ms3ma2zz4tnajxyyaaqlucd45",
    sei: "sei18rdj3asllguwr6lnyu2sw8p8nut0shuj3sme27ndvvw4gakjnjqqper95h",
    injective: "inj1vdu3s39dl8t5l88tyqwuhzklsx9587adv8cnn9"
}

export async function queryMarketInfos({chain}:{chain: Chain}):Promise<MarketInfo[]> {
    interface MarketsResp {
        markets: string[]
    }
    interface MarketInfoResp {
        market_addr: string,
        position_token: string,
        liquidity_token_lp: string,
        liquidity_token_xlp: string,
    }
    const factoryAddr = factories[chain]

    const marketIds: string[] = []
    while(true) {
        const resp:MarketsResp = await queryContract({
            chain,
            contract: factoryAddr,
            msg: {
                markets: {
                    start_after: marketIds.length ? marketIds[marketIds.length-1] : undefined
                }
            }
        })

        if(!resp || !resp.markets) {
            throw new Error(`failed to get market addresses on chain ${chain}`);
        }

        if(!resp.markets.length) {
            break;
        }

        marketIds.push(...resp.markets);
    }

    const queryMarketInfo = (marketId:string) => queryContract({
        chain,
        contract: factoryAddr,
        msg: {
            market_info: {
                market_id: marketId
            }
        }
    }).then((resp:MarketInfoResp) => ({
        id: marketId,
        addr: resp.market_addr,
        positionTokenAddr: resp.position_token,
        liquidityTokenLpAddr: resp.liquidity_token_lp,
        liquidityTokenXlpAddr: resp.liquidity_token_xlp,
    }))

    return await Promise.all(marketIds.map(queryMarketInfo))

}
