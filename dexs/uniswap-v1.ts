import { CHAIN } from '../helpers/chains'
import { FetchOptions } from '../adapters/types'

const abi = {
  "TokenPurchase": "event TokenPurchase(address indexed buyer, uint256 indexed eth_sold, uint256 indexed tokens_bought)",
  "EthPurchase": "event EthPurchase(address indexed buyer, uint256 indexed tokens_sold, uint256 indexed eth_bought)",
  "NewExchange": 'event NewExchange (address indexed token, address indexed exchange)',
}

const blacklists = [
  '0x46531ea0E7cec64b14181d45F8C6798a1cE45da1', // bad data on 2020-1014
  '0x46531ea0E7cec64b14181d45F8C6798a1cE45da1',
  '0x3211d27a1A1B8E40C7974F6951935303e6e56DBE',
]

export default {
  version: 2,
  pullHourly: true,
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
          if (blacklists.includes(log.source.toLowerCase())) return;
          // console.log(log.source.toLowerCase(), Number(log.parsedLog.args.eth_sold) / 1e18)
          dailyVolume.addGasToken(log.parsedLog.args.eth_sold)
        })

        ethLogs.forEach(log => {
          if (!pairs.has(log.source.toLowerCase())) return;
          if (blacklists.includes(log.source.toLowerCase())) return;

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
    Revenue: 'Protocol makes no revenue.',
    ProtocolRevenue: 'Protocol makes no revenue.',
    SupplySideRevenue: 'All fees are distributed to LPs.',
    HoldersRevenue: 'No revenue for UNI holders.',
  },
}
