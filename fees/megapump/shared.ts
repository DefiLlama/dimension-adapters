import ADDRESSES from '../../helpers/coreAssets.json'
import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// MegaPump (https://mega-pump.fun, https://x.com/megapumpeth) is a memecoin launchpad on MegaETH.
// Every launch and every bonding-curve trade goes through one UUPS proxy, the MegaPump factory:
//   https://megaeth.blockscout.com/address/0xB6bC3988d62D2979b3ab7AABCcf3c9443f7dAbc4
// Shared between the volume adapter (dexs/megapump.ts) and the fee adapter (fees/megapump/index.ts):
// one pass over the factory's Trade and Graduated events for the window.
//
// A curve is quoted in ETH, USDm or MEGA (chosen at creation, v3). The Trade event's amounts are in that
// quote, whatever the field name says: `ethAmount` is the gross quote amount of the trade (what the buyer
// paid in, fees included; what the curve paid out on a sell, before fees), and the three fee fields are
// the fees actually accrued on it (source: MegaPumpFactory.sol, _buy/_sell → _emitTrade):
//   platformFee  = 1% of the gross, minus the referrer slice, to the protocol (platformFeeBps = 100)
//   creatorFee   = 0.25% of the gross to the token's creator (creatorFeeBps = 25; 0 when the creator trades)
//   referrerFee  = slice of the platform fee paid to the referrer of the trade (0 without referrer)
// The token's quote is read from tokenData(tokenId).quote (address(0) = ETH).
//
// Graduation: when a curve reaches its threshold, the raised quote moves to a Uniswap v2 pool (the MegaPump
// DEX, listed as megapump-dex) and the factory keeps a fixed graduation fee, set per quote (graduationFee()
// for ETH, quoteConfig(quote).graduationFee for an ERC-20 quote) and capped at a tenth of the raise. The
// Graduated event does not carry the fee, so it is read from the factory at the window's end (a governance
// setting that is not expected to change) and the cap is applied from the event's liquidityETH, which is
// the raise minus the fee.
// After graduation the token trades on the DEX; those swaps belong to the megapump-dex listing.

export const chainConfig: Record<string, { factory: string; start: string }> = {
  [CHAIN.MEGAETH]: {
    factory: '0xB6bC3988d62D2979b3ab7AABCcf3c9443f7dAbc4',
    start: '2026-11-10', // trading opens on the mainnet factory (deployed 2026-07-09, paused until then)
  },
}

export const LABEL = {
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

export async function collectCurveActivity(options: FetchOptions) {
  const { factory } = chainConfig[options.chain]
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const [trades, graduations] = await Promise.all([
    options.getLogs({ target: factory, eventAbi: TRADE_EVENT }),
    options.getLogs({ target: factory, eventAbi: GRADUATED_EVENT }),
  ])

  // quote of every token seen in the window (immutable once the token exists)
  const tokenIds = [...new Set([...trades, ...graduations].map((log) => log.tokenId.toString()))]
  const tokenData = tokenIds.length
    ? await options.api.multiCall({ target: factory, abi: TOKEN_DATA_ABI, calls: tokenIds })
    : []
  // address(0) (= ADDRESSES.null) is the chain's gas token for the balances, so the quote is used as is
  const quoteOf: Record<string, string> = {}
  tokenIds.forEach((id, i) => { quoteOf[id] = tokenData[i].quote.toLowerCase() })
  const quoteToken = (id: string) => quoteOf[id]

  for (const log of trades) {
    const token = quoteToken(log.tokenId.toString())
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
    const quotes = [...new Set(graduations.map((log) => quoteToken(log.tokenId.toString())))]
    const erc20Quotes = quotes.filter((q) => q !== ADDRESSES.null)
    const [ethFee, quoteConfigs] = await Promise.all([
      quotes.includes(ADDRESSES.null) ? options.api.call({ target: factory, abi: GRADUATION_FEE_ABI }) : '0',
      erc20Quotes.length ? options.api.multiCall({ target: factory, abi: QUOTE_CONFIG_ABI, calls: erc20Quotes }) : [],
    ])
    const feeOf: Record<string, bigint> = { [ADDRESSES.null]: BigInt(ethFee) }
    erc20Quotes.forEach((q, i) => { feeOf[q] = BigInt(quoteConfigs[i].graduationFee) })
    for (const log of graduations) {
      const token = quoteToken(log.tokenId.toString())
      let fee = feeOf[token]
      // _graduate: fee = min(configured fee, totalRaised / 10), and liquidityETH = totalRaised - fee,
      // so when the cap binds the fee is liquidityETH / 9. Never binds with the current settings.
      const liquidity = BigInt(log.liquidityETH)
      if (fee * 10n > liquidity + fee) fee = liquidity / 9n
      dailyFees.add(token, fee, LABEL.graduationFees)
      dailyRevenue.add(token, fee, LABEL.graduationToProtocol)
    }
  }

  return { dailyVolume, dailyFees, dailyRevenue, dailySupplySideRevenue }
}
