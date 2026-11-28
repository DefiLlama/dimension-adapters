import ADDRESSES from '../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const FACTORY = '0xB6bC3988d62D2979b3ab7AABCcf3c9443f7dAbc4'

const LABEL = {
  tradingFees: METRIC.TRADING_FEES,
  graduationFees: 'Graduation Fees',
  tradingToProtocol: 'Trading Fees To Protocol',
  tradingToCreators: 'Trading Fees To Creators',
  tradingToReferrers: 'Trading Fees To Referrers',
  graduationToProtocol: 'Graduation Fees To Protocol',
}

const TRADE_EVENT = 'event Trade(uint256 indexed tokenId, address indexed tokenAddress, address indexed trader, bool isBuy, uint256 ethAmount, uint256 tokenAmount, uint256 platformFee, uint256 creatorFee, uint256 referrerFee, address referrer, uint256 newPrice, uint256 newMarketCap, uint256 newTokensSold, uint256 timestamp)'
const GRADUATED_EVENT = 'event Graduated(uint256 indexed tokenId, address indexed tokenAddress, address indexed dexPool, uint256 lpTokenId, uint256 liquidityETH, uint256 liquidityTokens, uint256 timestamp)'
const TOKEN_DATA_ABI = 'function tokenData(uint256) view returns (address creator, string name, string ticker, string metadataURI, uint256 createdBlock, uint256 createdAt, address tokenAddress, uint256 totalRaised, uint256 tokensSold, uint256 creatorFees, bool graduated, address dexPool, uint256 lpTokenId, uint256 graduationETH, address quote)'
const GRADUATION_FEE_ABI = 'uint256:graduationFee'
const QUOTE_CONFIG_ABI = 'function quoteConfig(address) view returns (bool enabled, uint256 graduationAmount, uint256 graduationFee)'

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const [trades, graduations] = await Promise.all([
    options.getLogs({ target: FACTORY, eventAbi: TRADE_EVENT }),
    options.getLogs({ target: FACTORY, eventAbi: GRADUATED_EVENT }),
  ])

  const tokenIds = [...new Set([...trades, ...graduations].map((log) => log.tokenId.toString()))]
  const tokenData = tokenIds.length
    ? await options.api.multiCall({ target: FACTORY, abi: TOKEN_DATA_ABI, calls: tokenIds })
    : []
  const quoteOf: Record<string, string> = {}
  tokenIds.forEach((id, i) => { quoteOf[id] = tokenData[i].quote.toLowerCase() })
  const balanceToken = (quote: string) => quote === ADDRESSES.null ? ADDRESSES.megaeth.ETH : quote

  for (const log of trades) {
    const token = balanceToken(quoteOf[log.tokenId.toString()])
    const platformFee = BigInt(log.platformFee)
    const creatorFee = BigInt(log.creatorFee)
    const referrerFee = BigInt(log.referrerFee)
    dailyVolume.add(token, log.ethAmount)
    dailyFees.add(token, platformFee + creatorFee + referrerFee, LABEL.tradingFees)
    dailyRevenue.add(token, platformFee, LABEL.tradingToProtocol)
    dailySupplySideRevenue.add(token, creatorFee, LABEL.tradingToCreators)
    dailySupplySideRevenue.add(token, referrerFee, LABEL.tradingToReferrers)
  }

  if (graduations.length) {
    const quotes = [...new Set(graduations.map((log) => quoteOf[log.tokenId.toString()]))]
    const erc20Quotes = quotes.filter((q) => q !== ADDRESSES.null)
    const [ethFee, quoteConfigs] = await Promise.all([
      quotes.includes(ADDRESSES.null) ? options.api.call({ target: FACTORY, abi: GRADUATION_FEE_ABI }) : '0',
      erc20Quotes.length ? options.api.multiCall({ target: FACTORY, abi: QUOTE_CONFIG_ABI, calls: erc20Quotes }) : [],
    ])
    const feeOf: Record<string, bigint> = { [ADDRESSES.null]: BigInt(ethFee) }
    erc20Quotes.forEach((q, i) => { feeOf[q] = BigInt(quoteConfigs[i].graduationFee) })
    for (const log of graduations) {
      const quote = quoteOf[log.tokenId.toString()]
      const liquidity = BigInt(log.liquidityETH)
      let fee = feeOf[quote]
      // fee is capped at totalRaised / 10 and liquidityETH = totalRaised - fee
      if (fee * 10n > liquidity + fee) fee = liquidity / 9n
      dailyFees.add(balanceToken(quote), fee, LABEL.graduationFees)
      dailyRevenue.add(balanceToken(quote), fee, LABEL.graduationToProtocol)
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  }
}

const methodology = {
  Volume: 'Quote side (ETH, USDm or MEGA) of every bonding-curve buy and sell on MegaPump, gross of fees. Trading after a token graduates to the DEX is not counted.',
  Fees: 'Traders pay a 1.25% fee on every bonding-curve buy and sell (1% protocol, 0.25% token creator, with any referrer cut taken out of the protocol 1%), plus a fixed graduation fee kept by the protocol when a curve graduates to the DEX. Token creation is free.',
  UserFees: 'Traders pay the 1.25% fee on every bonding-curve buy and sell and the graduation fee taken from the curve raise when a token graduates.',
  Revenue: 'The protocol 1% of every bonding-curve trade, minus the referrer cut, plus the graduation fees.',
  ProtocolRevenue: 'The protocol 1% of every bonding-curve trade, minus the referrer cut, plus the graduation fees, all kept by the protocol treasury.',
  SupplySideRevenue: 'The 0.25% creator cut of every bonding-curve trade (none when the creator trades their own token) and the referrer cut on referred trades.',
}

const breakdownMethodology = {
  Fees: {
    [LABEL.tradingFees]: '1.25% fee on the quote side of every bonding-curve buy and sell.',
    [LABEL.graduationFees]: 'Fixed fee per quote token kept when a curve graduates to the DEX, capped at 10% of the raise.',
  },
  UserFees: {
    [LABEL.tradingFees]: '1.25% fee on the quote side of every bonding-curve buy and sell.',
    [LABEL.graduationFees]: 'Fixed fee per quote token kept when a curve graduates to the DEX, capped at 10% of the raise.',
  },
  Revenue: {
    [LABEL.tradingToProtocol]: 'Protocol 1% of every bonding-curve trade, minus the referrer cut.',
    [LABEL.graduationToProtocol]: 'Graduation fees, kept by the protocol.',
  },
  ProtocolRevenue: {
    [LABEL.tradingToProtocol]: 'Protocol 1% of every bonding-curve trade, minus the referrer cut.',
    [LABEL.graduationToProtocol]: 'Graduation fees, kept by the protocol.',
  },
  SupplySideRevenue: {
    [LABEL.tradingToCreators]: '0.25% creator cut of every bonding-curve trade, claimable by the token creator.',
    [LABEL.tradingToReferrers]: 'Referrer cut of the protocol 1% on referred trades.',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.MEGAETH],
  start: '2026-11-10',
  methodology,
  breakdownMethodology,
}

export default adapter;
