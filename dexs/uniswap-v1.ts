
import { CHAIN } from '../helpers/chains'
import { FetchOptions } from '../adapters/types'

const abi = {
  "TokenPurchase": "event TokenPurchase(address indexed buyer, uint256 indexed eth_sold, uint256 indexed tokens_bought)",
  "EthPurchase": "event EthPurchase(address indexed buyer, uint256 indexed tokens_sold, uint256 indexed eth_bought)",
  "NewExchange": 'event NewExchange (address indexed token, address indexed exchange)',
}

export default {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: async ({ getLogs, createBalances, }: FetchOptions) => {
        const pairLogs = await getLogs({ eventAbi: abi.NewExchange, target: '0xc0a47dFe034B400B47bDaD5FecDa2621de6c4d95', cacheInCloud: true, fromBlock: 6627917, })
        const pairs = new Set(pairLogs.map(log => log.exchange.toLowerCase()))
        const tokenLogs = await getLogs({ eventAbi: abi.TokenPurchase, parseLog: true, entireLog: true, noTarget: true, })
        const ethLogs = await getLogs({ eventAbi: abi.EthPurchase, parseLog: true, entireLog: true, noTarget: true, })
        const dailyVolume = createBalances()

        tokenLogs.forEach(log => {
          if (!pairs.has(log.source.toLowerCase())) return;
          if (log.source.toLowerCase() === '0xa539baaa3aca455c986bb1e25301cef936ce1b65') return;  // bad data on 2020-1014
          dailyVolume.addGasToken(log.parsedLog.args.eth_sold)
        })

        ethLogs.forEach(log => {
          if (!pairs.has(log.source.toLowerCase())) return;
          if (log.source.toLowerCase() === '0xa539baaa3aca455c986bb1e25301cef936ce1b65') return;  // bad data on 2020-1014

          dailyVolume.addGasToken(log.parsedLog.args.eth_bought)
        })

        const dailyFees = dailyVolume.clone(0.3 / 100)

        return { dailyVolume, dailyFees, dailyUserFees: dailyFees, dailySupplySideRevenue: dailyFees, dailyRevenue: 0, dailyProtocolRevenue: 0, dailyHoldersRevenue: 0 }
      },
    },
  },
  methodology: {
    Fees: "User pays 0.3% fees on each swap.",
    UserFees: "User pays 0.3% fees on each swap.",
    Revenue: "Protocol have no revenue.",
    ProtocolRevenue: "Protocol have no revenue.",
    SupplySideRevenue: "All user fees are distributed among LPs.",
    HoldersRevenue: "Holders have no revenue."
  }
}