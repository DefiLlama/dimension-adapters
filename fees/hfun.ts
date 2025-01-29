import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { postURL } from "../utils/fetchURL";

const fetch: any = async (options: FetchOptions) => {
    const txs:any[] = await postURL("https://api.hyperliquid.xyz/info", { "type": "userNonFundingLedgerUpdates", "user": "0x501a76325a353a4249740ada1d4bce46dbdd67d6" })
    const dailyFees = options.createBalances()
    txs.forEach(tx=>{
        const ts = tx.time/1e3
        if(options.startTimestamp < ts && ts < options.endTimestamp && tx.delta.type === "spotTransfer" && tx.delta.token === "USDC" && tx.delta.destination === "0x501a76325a353a4249740ada1d4bce46dbdd67d6"){
            dailyFees.addCGToken("usd-coin", Number(tx.delta.amount))
        }
    })
    return { dailyFees, dailyRevenue: dailyFees, }
}

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.HYPERLIQUID]: {
            fetch
        },
    }
};

export default adapter;