import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { formatAddress } from "../utils/utils";

// Monad mainnet (chain id 143). ERC-1967 proxies, not the implementations.
const ACCOUNT_CORE = "0xA0Ba2f08c04C13190ad5dC74542ddc05C59AB516";
const SPOT_ROUTER = "0x7d08A7B163aadfA9FA8AEdFb40F41c0874376f7D";
const START_BLOCK = 112776229;
// Public Monad RPCs reject eth_getLogs ranges above 100 blocks.
// The SDK also widens each chunk by 10 blocks on both sides, so the requested span stays at 81.
const MAX_BLOCK_RANGE = 81;

const PPS = 10_000_000n;
const MATCH_END = 0x04;

const ABIS = {
  SpotMarketRegistered:
    "event SpotMarketRegistered(address indexed orderBook, address indexed baseToken, address indexed quoteToken, address operator, uint96 sizePrecision, uint32 pricePrecision, uint96 minQuoteNotional, uint32 tickSize, uint32 passiveSpreadTicks, uint8 quoteTokenDecimals, uint256 takerFeePps, uint256 makerFeePps)",
  TradesPacked:
    "event TradesPacked(uint40 indexed accountId, address indexed executor, bytes32 clientOrderId, uint24 effectiveTakerFeePps, address builder, uint24 builderFeePps, bytes packedTrades)",
  BuilderFeeAccrued:
    "event BuilderFeeAccrued(address indexed builder, address indexed asset, uint40 indexed takerAccountId, address orderBook, uint24 builderFeePps, uint256 amount)",
};

function feeDown(amount: bigint, feePps: bigint) {
  return (amount * feePps) / PPS;
}

function feeUp(amount: bigint, feePps: bigint) {
  return (amount * feePps + PPS - 1n) / PPS;
}

function rawQuote(price: bigint, fillSize: bigint, sizePrecision: bigint, pricePrecision: bigint, quoteScale: bigint) {
  const priceSizeUnits = (price * fillSize) / sizePrecision;
  return (priceSizeUnits * quoteScale) / pricePrecision;
}

function decodePackedTrades(packed: string) {
  const hex = packed.startsWith("0x") ? packed.slice(2) : packed;
  const records = [];
  for (let i = 0; i + 128 <= hex.length; i += 128) {
    const word0 = BigInt("0x" + hex.slice(i, i + 64));
    const word1 = BigInt("0x" + hex.slice(i + 64, i + 128));
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

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const registered = await options.getLogs({
    target: SPOT_ROUTER,
    eventAbi: ABIS.SpotMarketRegistered,
    fromBlock: START_BLOCK,
    cacheInCloud: true,
    maxBlockRange: MAX_BLOCK_RANGE,
  });

  const markets: Record<string, { quoteToken: string; sizePrecision: bigint; pricePrecision: bigint; quoteScale: bigint }> = {};
  for (const log of registered) {
    markets[formatAddress(log.orderBook)] = {
      quoteToken: formatAddress(log.quoteToken),
      sizePrecision: BigInt(log.sizePrecision),
      pricePrecision: BigInt(log.pricePrecision),
      quoteScale: 10n ** BigInt(log.quoteTokenDecimals),
    };
  }

  const orderBooks = Object.keys(markets);
  if (orderBooks.length) {
    const tradeLogs: any[][] = await options.getLogs({
      targets: orderBooks,
      eventAbi: ABIS.TradesPacked,
      flatten: false,
      maxBlockRange: MAX_BLOCK_RANGE,
    });

    for (let i = 0; i < orderBooks.length; i++) {
      const market = markets[formatAddress(orderBooks[i])];
      for (const event of tradeLogs[i]) {
        let matchQuote = 0n;
        let matchMakerFee = 0n;
        for (const record of decodePackedTrades(event.packedTrades)) {
          const quote = rawQuote(record.price, record.fillSize, market.sizePrecision, market.pricePrecision, market.quoteScale);
          dailyVolume.add(market.quoteToken, quote);
          matchQuote += quote;
          matchMakerFee += feeDown(quote, record.makerFeePps);
          if (!record.matchEnd) continue;

          const takerFee = feeUp(matchQuote, BigInt(event.effectiveTakerFeePps));
          if (takerFee > 0n) {
            dailyFees.add(market.quoteToken, takerFee, "Taker Fees");
            dailyRevenue.add(market.quoteToken, takerFee, "Taker Fees");
          }
          if (matchMakerFee > 0n) {
            dailyFees.add(market.quoteToken, matchMakerFee, "Maker Fees");
            dailyRevenue.add(market.quoteToken, matchMakerFee, "Maker Fees");
          }
          matchQuote = 0n;
          matchMakerFee = 0n;
        }
      }
    }
  }

  const builderFees = await options.getLogs({
    target: ACCOUNT_CORE,
    eventAbi: ABIS.BuilderFeeAccrued,
    maxBlockRange: MAX_BLOCK_RANGE,
  });
  for (const log of builderFees) {
    if (BigInt(log.amount) === 0n) continue;
    dailyFees.add(log.asset, log.amount, "Builder Fees");
    dailySupplySideRevenue.add(log.asset, log.amount, "Builder Fees");
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "Quote notional of every OrderBook fill in TradesPacked. That includes native orders, swaps, and passive-band fills.",
  Fees: "Taker fee, active maker fee, and builder fee.",
  UserFees: "Taker, maker, and builder fees are paid by users.",
  Revenue: "Taker fee and active maker fee, both taken in the quote token and credited to the protocol fee collector.",
  ProtocolRevenue: "Taker fee and active maker fee. Builder fees are excluded.",
  SupplySideRevenue: "Builder fees credited to the approved builder. A taker buy pays this in base. A taker sell pays it in quote.",
};

const breakdownMethodology = {
  Fees: {
    "Taker Fees": "Quote fee charged to the taker, rounded up, once per match.",
    "Maker Fees": "Quote fee charged to active makers, rounded down, per fill. Passive fills carry a zero maker fee.",
    "Builder Fees": "Fee credited to the approved builder.",
  },
  Revenue: {
    "Taker Fees": "Taker fee kept by the protocol fee collector.",
    "Maker Fees": "Active maker fee kept by the protocol fee collector.",
  },
  ProtocolRevenue: {
    "Taker Fees": "Taker fee kept by the protocol fee collector.",
    "Maker Fees": "Active maker fee kept by the protocol fee collector.",
  },
  SupplySideRevenue: {
    "Builder Fees": "Builder fee credited on AccountCore.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  start: "2026-10-12",
  chains: [CHAIN.MONAD],
  methodology,
  breakdownMethodology,
};

export default adapter;
