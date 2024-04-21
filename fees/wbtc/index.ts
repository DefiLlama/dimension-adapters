import { FetchOptions } from "../../adapters/types";

const btcRpcCall = (method:string, params:any)=> fetch("https://rpc.ankr.com/btc", {
        method: "POST",
        body: JSON.stringify({
            "jsonrpc": "1.0",
            "id": "1",
            method,
            params
        })
    }).then(r=>r.json())

async function getBitcoinTx(txId:string){
    const fullTx = await btcRpcCall("getrawtransaction",[txId])
    return btcRpcCall("decoderawtransaction", [fullTx.result])
}

function findClosest(arr:number[], target:number){
    return arr.reduce((best, item)=>{
        if(Math.abs(target-item) < Math.abs(target-best)){
            return item
        }
        return best
    })
}

export default {
    adapter: {
        "ethereum": {
            fetch: async ({ getLogs, createBalances }: FetchOptions) => {
                const mints = await getLogs({target: "0xe5A5F138005E19A3E6D0FE68b039397EeEf2322b", eventAbi: "event MintConfirmed (uint256 indexed nonce, address indexed requester, uint256 amount, string btcDepositAddress, string btcTxid, uint256 timestamp, bytes32 requestHash)"})
                const burns = await getLogs({target: "0xe5A5F138005E19A3E6D0FE68b039397EeEf2322b", eventAbi: "event BurnConfirmed (uint256 indexed nonce, address indexed requester, uint256 amount, string btcDepositAddress, string btcTxid, uint256 timestamp, bytes32 inputRequestHash)"})
                const dailyFees = createBalances();
                await Promise.all(mints.concat(burns).map(async event=>{
                    const amount = Number(event.amount)
                    const btcTx = await getBitcoinTx(event.btcTxid)
                    const btcSend = findClosest(btcTx.result.vout.map(v=>v.value), amount/1e8)
                    dailyFees.add('0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', Math.abs(amount-btcSend*1e8));
                }))
                return { dailyFees, dailyRevenue: dailyFees }

            },
            start: 1543017600
        }
    },
    version: 2
}