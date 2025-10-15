// 0xaB4AdA40112e0051a5add07f2304D749Bb8944fA - referral rewards
// 0x501a76325a353a4249740ada1d4bce46dbdd67d6 - HFUN Fees Receiver

import { Balances } from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { postURL } from "../utils/fetchURL";


async function addReceivedUSDC(options:FetchOptions, balances: Balances, address:string){
    const txs:any[] = await postURL("https://api.hyperliquid.xyz/info", { "type": "userNonFundingLedgerUpdates", "user": address })
    txs.forEach(tx=>{
        const ts = tx.time/1e3
        if(options.startTimestamp < ts && ts < options.endTimestamp && (tx.delta.type === "spotTransfer" || tx.delta.type === "spotSend") && tx.delta.token === "USDC" && tx.delta.destination === address.toLowerCase()){
            balances.addCGToken("usd-coin", Number(tx.delta.amount))
        }
    })
}

const fetch: any = async (options: FetchOptions) => {
    const dailyFees = options.createBalances()
    const dailyRevenue = options.createBalances()
    await addReceivedUSDC(options, dailyRevenue, "0x501a76325a353a4249740ada1d4bce46dbdd67d6")
    await addReceivedUSDC(options, dailyFees, "0xaB4AdA40112e0051a5add07f2304D749Bb8944fA")
    dailyFees.addBalances(dailyRevenue);
    return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue }
}

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.HYPERLIQUID]: {
            fetch,
        },
    },
    methodology: {
        Fees: 'All trading fees paid by users.',
        Revenue: 'All trading fees paid by users.',
        ProtocolRevenue: 'All trading fees paid by users.',
    }
};

export default adapter;