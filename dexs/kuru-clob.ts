import ADDRESSES from '../helpers/coreAssets.json'
import { Balances } from "@defillama/sdk";
import { CHAIN } from "../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { formatAddress } from "../utils/utils";

interface ClobConfig {
  router: string;
  fromBlock: number;
}

const CONFIGS: Record<string, ClobConfig> = {
  [CHAIN.MONAD]: {
    router: '0xd651346d7c789536ebf06dc72aE3C8502cd695CC',
    fromBlock: 33384150,
  },
};

// Order books launched on 15 Oct 2026 (ERC-1967 proxies). Both sets are counted while the original router winds down.
// https://gist.github.com/devblixt/0093a81e9fc21b6c96e74ac3d3eb08e9
const ACCOUNT_CORE = '0x264123a9B96Cc1193944cC25C188f1bD3dFa670e'
const SPOT_ROUTER = '0xBdDF3556701B7ECca5d69416CFfd7F86D37E52b3'
const SPOT_ROUTER_FROM_BLOCK = 113639072 // first market registered on SpotRouter

const ABIS = {
  decimals: 'uint8:decimals',
  EventTrade: 'event Trade (uint40 orderId, address makerAddress, bool isBuy, uint256 price, uint96 updatedSize, address takerAddress, address txOrigin, uint96 filledSize)',
  EventMarketregistered: 'event MarketRegistered (address baseAsset, address quoteAsset, address market, address vaultAddress, uint32 pricePrecision, uint96 sizePrecision, uint32 tickSize, uint96 minSize, uint96 maxSize, uint256 takerFeeBps, uint256 makerFeeBps, uint96 kuruAmmSpread)',
  EventSpotMarketRegistered: 'event SpotMarketRegistered(address indexed orderBook, address indexed baseToken, address indexed quoteToken, address operator, uint96 sizePrecision, uint32 pricePrecision, uint96 minQuoteNotional, uint32 tickSize, uint32 passiveSpreadTicks, uint8 quoteTokenDecimals, uint256 takerFeePps, uint256 makerFeePps)',
  EventTradesPacked: 'event TradesPacked(uint40 indexed accountId, address indexed executor, bytes32 clientOrderId, uint24 effectiveTakerFeePps, address builder, uint24 builderFeePps, bytes packedTrades)',
  EventBuilderFeeAccrued: 'event BuilderFeeAccrued(address indexed builder, address indexed asset, uint40 indexed takerAccountId, address orderBook, uint24 builderFeePps, uint256 amount)',
}

interface Market {
  address: string;
  baseAsset: string;
  quoteAsset: string;
  pricePrecision: number;
  sizePrecision: number;
  takerFeeBps: bigint;
  makerFeeBps: bigint;
}

const BPS_MULTIPLIER = BigInt(10000);
// SpotRouter order books express fees in parts per 10^7 (1000 = 1 bp).
const PPS = BigInt(10000000);
// Maker-flags bit set on the last fill of a taker match in TradesPacked.
const MATCH_END = 0x04;

/** Rounds a fee down: (amount * feePps) / 10^7. Used for maker fees. */
function feeDown(amount: bigint, feePps: bigint) {
  return (amount * feePps) / PPS;
}

/** Rounds a fee up: (amount * feePps + 10^7 - 1) / 10^7. Used for taker fees. */
function feeUp(amount: bigint, feePps: bigint) {
  return (amount * feePps + PPS - 1n) / PPS;
}

/** Converts a packed fill's price and size into raw quote-token atoms. */
function rawQuote(price: bigint, fillSize: bigint, sizePrecision: bigint, pricePrecision: bigint, quoteScale: bigint) {
  const priceSizeUnits = (price * fillSize) / sizePrecision;
  return (priceSizeUnits * quoteScale) / pricePrecision;
}

/** Splits a TradesPacked payload into 64-byte fill records. */
function decodePackedTrades(packed: string) {
  const hex = packed.startsWith('0x') ? packed.slice(2) : packed;
  const records = [];
  for (let i = 0; i + 128 <= hex.length; i += 128) {
    const word0 = BigInt('0x' + hex.slice(i, i + 64));
    const word1 = BigInt('0x' + hex.slice(i + 64, i + 128));
    const makerFlags = Number((word0 >> 200n) & 0xffn);
    records.push({
      price: (word0 >> 168n) & 0xffffffffn,
      fillSize: (word0 >> 72n) & ((1n << 96n) - 1n),
      makerFeePps: (word1 >> 136n) & 0xffffffn,
      matchEnd: (makerFlags & MATCH_END) !== 0,
    });
  }
  return records;
}

type Metrics = Record<'dailyVolume' | 'dailyFees' | 'dailyRevenue' | 'dailySupplySideRevenue', Balances>

/** Adds volume, taker and maker fees, and builder fees from the SpotRouter order books. */
async function addSpotRouterMarkets(options: FetchOptions, { dailyVolume, dailyFees, dailyRevenue, dailySupplySideRevenue }: Metrics) {
  const registered = await options.getLogs({
    target: SPOT_ROUTER,
    eventAbi: ABIS.EventSpotMarketRegistered,
    fromBlock: SPOT_ROUTER_FROM_BLOCK,
    cacheInCloud: true,
  })
  // The first market was registered at SPOT_ROUTER_FROM_BLOCK, so an empty result means the log source is incomplete.
  if (!registered.length) throw new Error('No SpotRouter markets found')

  const spotMarkets: Record<string, { quoteToken: string; sizePrecision: bigint; pricePrecision: bigint; quoteScale: bigint }> = {}
  for (const log of registered) {
    spotMarkets[formatAddress(log.orderBook)] = {
      quoteToken: formatAddress(log.quoteToken),
      sizePrecision: BigInt(log.sizePrecision),
      pricePrecision: BigInt(log.pricePrecision),
      quoteScale: 10n ** BigInt(log.quoteTokenDecimals),
    }
  }

  const orderBooks = Object.keys(spotMarkets)
  const tradeLogs: any[][] = await options.getLogs({
    targets: orderBooks,
    eventAbi: ABIS.EventTradesPacked,
    flatten: false,
  })

  for (let i = 0; i < orderBooks.length; i++) {
    const market = spotMarkets[orderBooks[i]]
    for (const event of tradeLogs[i]) {
      let matchQuote = 0n
      let matchMakerFee = 0n
      for (const record of decodePackedTrades(event.packedTrades)) {
        const quote = rawQuote(record.price, record.fillSize, market.sizePrecision, market.pricePrecision, market.quoteScale)
        dailyVolume.add(market.quoteToken, quote)
        matchQuote += quote
        matchMakerFee += feeDown(quote, record.makerFeePps)
        if (!record.matchEnd) continue

        const takerFee = feeUp(matchQuote, BigInt(event.effectiveTakerFeePps))
        if (takerFee > 0n) {
          dailyFees.add(market.quoteToken, takerFee, 'Taker Fees')
          dailyRevenue.add(market.quoteToken, takerFee, 'Taker Fees To Protocol')
        }
        if (matchMakerFee > 0n) {
          dailyFees.add(market.quoteToken, matchMakerFee, 'Maker Fees')
          dailyRevenue.add(market.quoteToken, matchMakerFee, 'Maker Fees To Protocol')
        }
        matchQuote = 0n
        matchMakerFee = 0n
      }
    }
  }

  const builderFees = await options.getLogs({
    target: ACCOUNT_CORE,
    eventAbi: ABIS.EventBuilderFeeAccrued,
  })
  for (const log of builderFees) {
    if (BigInt(log.amount) === 0n) continue
    dailyFees.add(log.asset, log.amount, 'Builder Fees')
    dailySupplySideRevenue.add(log.asset, log.amount, 'Builder Fees To Builders')
  }
}

/** Volume and fees from the original Kuru router and, since 15 Oct 2026, the SpotRouter order books. */
async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const markets: Record<string, Market> = {}
  const quoteAssetPrecisions: Record<string, bigint> = {}
  const baseAssetPrecisions: Record<string, bigint> = {}

  const MarketRegisteredEvents = await options.getLogs({
    target: CONFIGS[options.chain].router,
    eventAbi: ABIS.EventMarketregistered,
    fromBlock: CONFIGS[options.chain].fromBlock,
    cacheInCloud: true,
  })

  const missingMarket = '0x699AbC15308156E9a3AB89Ec7387e9CfE1c86A3b'.toLowerCase()
  const hasMissingMarket = !MarketRegisteredEvents.find((m: any) => m.market.toLowerCase() === missingMarket)

  // indexer bug, missing exactly this event log
  // tx: 0x2630ba6a69d120c14fc6c2f0125e5f4499bd5125ab8f62a499cbe36a628934f7
  // takerFeeBps/makerFeeBps verified live via Kuru's markets API (api.kuru.io/api/v1/markets): 0/0
  if (hasMissingMarket)
    MarketRegisteredEvents.push({
      market: '0x699AbC15308156E9a3AB89Ec7387e9CfE1c86A3b',
      baseAsset: ADDRESSES.mantle.AUSD,
      quoteAsset: ADDRESSES.monad.USDC,
      pricePrecision: BigInt(100000000),
      sizePrecision: BigInt(1000000),
      takerFeeBps: BigInt(0),
      makerFeeBps: BigInt(0),
    })

  for (const log of MarketRegisteredEvents) {
    const address = formatAddress(log.market)
    markets[address] = {
      address: address,
      baseAsset: formatAddress(log.baseAsset),
      quoteAsset: formatAddress(log.quoteAsset),
      pricePrecision: Number(log.pricePrecision),
      sizePrecision: Number(log.sizePrecision),
      takerFeeBps: BigInt(log.takerFeeBps),
      makerFeeBps: BigInt(log.makerFeeBps),
    }

    if (log.quoteAsset === ADDRESSES.null) {
      quoteAssetPrecisions[formatAddress(log.quoteAsset)] = BigInt(1e18);
    } else {
      quoteAssetPrecisions[formatAddress(log.quoteAsset)] = BigInt(0);
    }

    if (log.baseAsset === ADDRESSES.null) {
      baseAssetPrecisions[formatAddress(log.baseAsset)] = BigInt(1e18);
    } else {
      baseAssetPrecisions[formatAddress(log.baseAsset)] = BigInt(0);
    }
  }

  const quoteAssets = Object.keys(quoteAssetPrecisions)
  const decimals = await options.api.multiCall({
    abi: ABIS.decimals,
    permitFailure: true,
    calls: quoteAssets,
  });
  for (let i = 0; i < quoteAssets.length; i++) {
    if (decimals[i]) {
      quoteAssetPrecisions[quoteAssets[i]] = BigInt(10 ** Number(decimals[i]))
    }
  }

  const baseAssets = Object.keys(baseAssetPrecisions)
  const baseDecimals = await options.api.multiCall({
    abi: ABIS.decimals,
    permitFailure: true,
    calls: baseAssets,
  });
  for (let i = 0; i < baseAssets.length; i++) {
    if (baseDecimals[i]) {
      baseAssetPrecisions[baseAssets[i]] = BigInt(10 ** Number(baseDecimals[i]))
    }
  }

  const marketAddresses = MarketRegisteredEvents.map((m: any) => m.market)
  const TradeEvents = await options.getLogs({
    targets: marketAddresses,
    eventAbi: ABIS.EventTrade,
    flatten: false,
    parseLog: false,
  })

  for (let i = 0; i < marketAddresses.length; i++) {
    const market = markets[formatAddress(marketAddresses[i])]
    for (const marketTradeEvent of TradeEvents[i]) {
      // volume = price * filledSize * quoteDecimalMultiplier / (size_precision * 10**18)
      const volumeQuote = BigInt(marketTradeEvent.price)
        * BigInt(marketTradeEvent.filledSize)
        * quoteAssetPrecisions[market.quoteAsset]
        / (BigInt(market.sizePrecision) * BigInt(1e18))

      dailyVolume.add(market.quoteAsset, String(volumeQuote))

      if (market.takerFeeBps === BigInt(0)) continue

      // Trade.isBuy reflects the resting maker order's side, not the taker's. The taker fee (and its matching maker rebate) is charged in whichever
      // asset the taker receives - base on a buy, quote on a sell.
      const isTakerBuy = !marketTradeEvent.isBuy
      const preFeeAmount = isTakerBuy
        ? BigInt(marketTradeEvent.filledSize) * baseAssetPrecisions[market.baseAsset] / BigInt(market.sizePrecision)
        : volumeQuote
      const feeToken = isTakerBuy ? market.baseAsset : market.quoteAsset

      const takerFee = preFeeAmount * market.takerFeeBps / BPS_MULTIPLIER
      const makerRebate = preFeeAmount * market.makerFeeBps / BPS_MULTIPLIER

      dailyFees.add(feeToken, String(takerFee), 'Taker Fees')
      if (makerRebate > BigInt(0)) dailySupplySideRevenue.add(feeToken, String(makerRebate), 'Taker Fees To Makers')
      dailyRevenue.add(feeToken, String(takerFee - makerRebate), 'Taker Fees To Protocol')
    }
  }

  if (await options.getToBlock() >= SPOT_ROUTER_FROM_BLOCK)
    await addSpotRouterMarkets(options, { dailyVolume, dailyFees, dailyRevenue, dailySupplySideRevenue })

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
  }
}

const methodology = {
  Volume: "Dollar value of every trade, based on the price and size it executed at.",
  Fees: "Fees paid by traders: the taker fee on every trade, plus the maker fee and approved-builder fees on the order books launched on 15 October 2026.",
  Revenue: "What the protocol keeps: the taker fee net of the maker rebate on the original order books, and the full taker and maker fees on the order books launched on 15 October 2026.",
  SupplySideRevenue: "Rebates paid to makers on the original order books, and fees paid to approved builders on the order books launched on 15 October 2026.",
}

const breakdownMethodology = {
  Fees: {
    'Taker Fees': "Fee charged to the taker on each trade.",
    'Maker Fees': "Fee charged to makers whose resting orders are filled, on the order books launched on 15 October 2026. Fills against passive liquidity carry no maker fee.",
    'Builder Fees': "Fee charged on trades routed by an approved builder, on the order books launched on 15 October 2026.",
  },
  Revenue: {
    'Taker Fees To Protocol': "Taker fee kept by the protocol: net of the maker rebate on the original order books, in full on the order books launched on 15 October 2026.",
    'Maker Fees To Protocol': "Maker fee kept by the protocol.",
  },
  SupplySideRevenue: {
    'Taker Fees To Makers': "Rebate paid to the maker whose order was filled, funded from the taker fee. Original order books only.",
    'Builder Fees To Builders': "Builder fee credited to the approved builder.",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  start: '2025-11-23',
  chains: [CHAIN.MONAD],
  methodology,
  breakdownMethodology,
}

export default adapter;
