import ADDRESSES from '../../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Trades emit on TokenManager V1 (BNB quote) and TokenManager2 (BNB or ERC-20 quote), regardless of router.
const WBNB = ADDRESSES.bsc.WBNB
const TOKEN_MANAGER_V1 = '0xec4549cadce5da21df6e6422d448034b5233bfbc'
const TOKEN_MANAGER_V2 = '0x5c952063c7fc8610ffdb798152d69f0b9550762b'
const TOKEN_INFOS = 'function _tokenInfos(address) view returns (address base, address quote, uint256 template, uint256 totalSupply, uint256 maxOffers, uint256 maxRaising, uint256 launchTime, uint256 offers, uint256 funds, uint256 lastPrice, uint256 K, uint256 T, uint256 status)'

// Event layouts checked against live logs: no indexed params, topic0 0x00fe0e12../0x80d4e495.. on V1 and 0x7db52723../0x0a5575b3.. on V2.
const V1_TRADE_EVENTS = [
  'event TokenPurchase(address token, address account, uint256 tokenAmount, uint256 etherAmount, uint256 fee)',
  'event TokenSale(address token, address account, uint256 tokenAmount, uint256 etherAmount, uint256 fee)',
]
const V2_TRADE_EVENTS = [
  'event TokenPurchase(address token, address account, uint256 price, uint256 amount, uint256 cost, uint256 fee, uint256 offers, uint256 funds)',
  'event TokenSale(address token, address account, uint256 price, uint256 amount, uint256 cost, uint256 fee, uint256 offers, uint256 funds)',
]

// OpenFour (the launch engine introduced by Four.Meme), https://github.com/four-meme-community/openfour-docs: every curve
// trade emits TradeExecuted on Core with the quote asset. Volume is what the trader put in: traderQuoteAmount on buys
// (curve amount plus fees), curveQuoteAmount on sells (before fees), per the guide's §10.2 amount relationships.
// Sample tx 0x2c906e792ae2c6ad84efbfe23212d8a5fb335a20720ac95a96ace695172ba6d3: curve trade of 150.625 BNC4.
// TapeFour (presetId 1778027615734) curve trades are NAND NFT fundraising, which the OpenFour integration guide says to
// keep out of ERC-20 volume.
const OPENFOUR_CORE = '0xebe7b6c1089d9f72ad07f34e36d898e44e5e27f3'
const TAPEFOUR_PRESET = '1778027615734'
const TRADE_EXECUTED = 'event TradeExecuted(address indexed token, address indexed trader, uint256 indexed presetId, bool isBuy, address quoteAsset, address vault, uint256 requestedTokenAmount, uint256 tokenAmount, uint256 curveQuoteAmount, uint256 traderQuoteAmount, uint256 lastPrice, uint256 slippageLimit, uint256 protocolFee, uint256 taxFee, uint256 devFee, uint256 antiSniperFee, uint256 totalRaised, uint256 remainingForSale)'

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances()

  // V1: every curve is quoted in BNB
  for (const eventAbi of V1_TRADE_EVENTS) {
    const logs = await options.getLogs({ target: TOKEN_MANAGER_V1, eventAbi })
    logs.forEach((log: any) => dailyVolume.add(WBNB, log.etherAmount))
  }

  // V2: cost is in the quote token TokenManager2 records for the curve; address(0) means BNB
  const costByToken: Record<string, bigint> = {}
  for (const eventAbi of V2_TRADE_EVENTS) {
    const logs = await options.getLogs({ target: TOKEN_MANAGER_V2, eventAbi })
    logs.forEach((log: any) => {
      const token = log.token.toLowerCase()
      costByToken[token] = (costByToken[token] ?? 0n) + BigInt(log.cost)
    })
  }
  const tokens = Object.keys(costByToken)
  const tokenInfos = await options.api.multiCall({ target: TOKEN_MANAGER_V2, abi: TOKEN_INFOS, calls: tokens })
  tokens.forEach((token, i) => {
    const quote = tokenInfos[i].quote.toLowerCase()
    dailyVolume.add(quote === ADDRESSES.null ? WBNB : quote, costByToken[token].toString())
  })

  // OpenFour: quoteAsset is in the event
  const trades = await options.getLogs({ target: OPENFOUR_CORE, eventAbi: TRADE_EXECUTED })
  trades.forEach((log: any) => {
    if (String(log.presetId) === TAPEFOUR_PRESET) return
    dailyVolume.add(log.quoteAsset, log.isBuy ? log.traderQuoteAmount : log.curveQuoteAmount)
  })

  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.BSC],
  start: '2024-12-25',
  pullHourly: true,
  methodology: {
    Volume: "Sum of every buy and sell on four.meme's V1 and V2 bonding curves, taken from the on-chain TokenPurchase/TokenSale events. Each trade's cost is valued in the quote token TokenManager2 records for that curve: BNB, a stablecoin, or any other ERC-20 such as the tokenized stocks some curves are priced in. Plus OpenFour bonding-curve trades in the trade's quote asset (TradeExecuted: what the buyer paid including fees, and the seller's amount before fees), except TapeFour NFT fundraising.",
  },
}

export default adapter
