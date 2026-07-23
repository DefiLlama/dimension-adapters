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

const ABIS = {
  decimals: 'uint8:decimals',
  EventTrade: 'event Trade (uint40 orderId, address makerAddress, bool isBuy, uint256 price, uint96 updatedSize, address takerAddress, address txOrigin, uint96 filledSize)',
  EventMarketregistered: 'event MarketRegistered (address baseAsset, address quoteAsset, address market, address vaultAddress, uint32 pricePrecision, uint96 sizePrecision, uint32 tickSize, uint96 minSize, uint96 maxSize, uint256 takerFeeBps, uint256 makerFeeBps, uint96 kuruAmmSpread)',
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
      baseAsset: '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a',
      quoteAsset: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603',
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

    if (log.quoteAsset === '0x0000000000000000000000000000000000000000') {
      quoteAssetPrecisions[formatAddress(log.quoteAsset)] = BigInt(1e18);
    } else {
      quoteAssetPrecisions[formatAddress(log.quoteAsset)] = BigInt(0);
    }

    if (log.baseAsset === '0x0000000000000000000000000000000000000000') {
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

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
  }
}

const methodology = {
  Volume: "Dollar value of every trade, based on the price and size it executed at.",
  Fees: "The taker fee charged on completed trades. Each market's fee is fixed forever once it's created.",
  Revenue: "What the protocol keeps after paying makers their rebate.",
  SupplySideRevenue: "A rebate paid to the maker.",
}

const breakdownMethodology = {
  Fees: {
    'Taker Fees': "Fee charged to the taker on each trade.",
  },
  Revenue: {
    'Taker Fees To Protocol': "Taker fee net of the maker rebate - the protocol's own cut.",
  },
  SupplySideRevenue: {
    'Taker Fees To Makers': "Rebate paid to the maker whose order was filled, funded from the taker fee.",
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
