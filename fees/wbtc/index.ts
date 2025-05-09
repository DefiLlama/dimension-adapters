import { FetchOptions } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";

async function getBitcoinTx(txId: string) {
  return httpGet(`https://api.blockcypher.com/v1/btc/main/txs/${txId}?includeHex=true`)
}

export default {
  adapter: {
    "ethereum": {
      fetch: async (_: any, _1: any, { getLogs, createBalances }: FetchOptions) => {
        const mints = await getLogs({ target: "0xe5A5F138005E19A3E6D0FE68b039397EeEf2322b", eventAbi: "event MintConfirmed (uint256 indexed nonce, address indexed requester, uint256 amount, string btcDepositAddress, string btcTxid, uint256 timestamp, bytes32 requestHash)" })
        const burns = await getLogs({ target: "0xe5A5F138005E19A3E6D0FE68b039397EeEf2322b", eventAbi: "event BurnConfirmed (uint256 indexed nonce, address indexed requester, uint256 amount, string btcDepositAddress, string btcTxid, uint256 timestamp, bytes32 inputRequestHash)" })
        const dailyFees = createBalances();
        await Promise.all(mints.concat(burns).map(async event => {
          const amount = Number(event.amount)
          const btcTx = await getBitcoinTx(event.btcTxid)
          const btcSend = btcTx.outputs.filter(v => v.addresses[0] === event.btcDepositAddress).reduce((sum, v) => sum + v.value, 0)
          dailyFees.add('0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', Math.abs(amount - btcSend));
        }))
        return { dailyFees, dailyRevenue: dailyFees }

      },
      start: '2018-11-24'
    }
  },
}