import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"

const NFT_CONTRACT = '0x133CAEecA096cA54889db71956c7f75862Ead7A0'
const SPEND_CONTRACT = '0xe2e3B88B9893e18D0867c08f9cA93f8aB5935b14'
const SPEND_EVENT= 'event Authorized (string authorizationToken, uint256 indexed tokenId, address indexed sender, string cardId, address cardCurrency, uint256 paidAmount)'
const TRANSFER_EVENT= 'event Transfer (address indexed from, address indexed to, uint256 indexed tokenId)'
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const ZERO_TOPIC = '0x0000000000000000000000000000000000000000000000000000000000000000'
const MINT_START_BLOCK = 298189162

const CURRENCY_RATES: Record<string, number> = {
  '0x2c5d06f591d0d8cd43ac232c2b654475a142c7da': 1.1722, // EUR
  '0xbe00f3db78688d9704bcb4e0a827aea3a9cc0d62': 1,      // USD
  '0xd41f1f0cf89fd239ca4c1f8e8ada46345c86b0a4': 1.25,   // CHF
  '0x7288ac74d211735374a23707d1518dcbbc0144fd': 0.14,    // CNY
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const spendLogs = await options.getLogs({
    target: SPEND_CONTRACT,
    eventAbi: SPEND_EVENT,
  })

  if (spendLogs.length === 0) return { dailyVolume: 0 }

  // Fetch all mint events and filter wallets
  const mintLogs = await options.getLogs({
    target: NFT_CONTRACT,
    eventAbi: TRANSFER_EVENT,
    topics: [TRANSFER_TOPIC, ZERO_TOPIC],
    fromBlock: MINT_START_BLOCK,
    cacheInCloud: true,
  })

  const mintWallets = new Set(
    mintLogs.map((log: any) => log.to.toLowerCase())
  )

  let totalVolume = 0

  for (const log of spendLogs) {
    const walletAddress = log.sender.toLowerCase()
    if (!mintWallets.has(walletAddress)) continue

    const currencyContract = log.cardCurrency.toLowerCase()
    const spendAmount = Number(log.paidAmount) / 1e2

    const rate = CURRENCY_RATES[currencyContract]
    if (rate) {
      totalVolume += spendAmount * rate
    }
  }

  return { dailyVolume: totalVolume };
};

const adapter: SimpleAdapter = {
  fetch,
  start: '2025-01-21',
  chains: [CHAIN.ARBITRUM],
};

export default adapter;