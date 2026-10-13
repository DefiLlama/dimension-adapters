import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { formatAddress } from "../utils/utils";

// Kuru v2 ERC-1967 proxies on Monad (chain 143), deployment source commit bcf0b7c.
// SpotRouter was deployed at block 112776229 (2026-10-12).
const ACCOUNT_CORE = "0xA0Ba2f08c04C13190ad5dC74542ddc05C59AB516";
const SPOT_ROUTER = "0x7d08A7B163aadfA9FA8AEdFb40F41c0874376f7D";
const START_BLOCK = 112776229;

// Fee rates are in parts per 10^7 (7000 = 0.07%): https://kuru-testnet-docs.mintlify.site/deployments/testnet
const PPS = 10_000_000n;
// Maker-flags bit set on the last fill of a taker match.
const MATCH_END = 0x04;

const ABIS = {
  SpotMarketRegistered:
    "event SpotMarketRegistered(address indexed orderBook, address indexed baseToken, address indexed quoteToken, address operator, uint96 sizePrecision, uint32 pricePrecision, uint96 minQuoteNotional, uint32 tickSize, uint32 passiveSpreadTicks, uint8 quoteTokenDecimals, uint256 takerFeePps, uint256 makerFeePps)",
  TradesPacked:
    "event TradesPacked(uint40 indexed accountId, address indexed executor, bytes32 clientOrderId, uint24 effectiveTakerFeePps, address builder, uint24 builderFeePps, bytes packedTrades)",
  BuilderFeeAccrued:
    "event BuilderFeeAccrued(address indexed builder, address indexed asset, uint40 indexed takerAccountId, address orderBook, uint24 builderFeePps, uint256 amount)",
};

/** Rounds a fee down: (amount * feePps) / 10_000_000. Used for maker fees. */
function feeDown(amount: bigint, feePps: bigint) {
  return (amount * feePps) / PPS;
}

/** Rounds a fee up: (amount * feePps + 10_000_000 - 1) / 10_000_000. Used for taker fees. */
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

/** Loads Kuru v2 markets, trade fills, and builder fees for the requested window. */
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
    });

    for (let i = 0; i < orderBooks.length; i++) {
      const market = markets[orderBooks[i]];
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
            dailyRevenue.add(market.quoteToken, takerFee, "Taker Fees To Protocol");
          }
          if (matchMakerFee > 0n) {
            dailyFees.add(market.quoteToken, matchMakerFee, "Maker Fees");
            dailyRevenue.add(market.quoteToken, matchMakerFee, "Maker Fees To Protocol");
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
  });
  for (const log of builderFees) {
    if (BigInt(log.amount) === 0n) continue;
    dailyFees.add(log.asset, log.amount, "Builder Fees");
    dailySupplySideRevenue.add(log.asset, log.amount, "Builder Fees To Builders");
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "Value of every trade on Kuru v2 order books, in the quote token at the price each fill executed at.",
  Fees: "Taker and maker trading fees, plus fees charged by approved builders that route trades.",
  Revenue: "Taker and maker trading fees, kept by the protocol.",
  ProtocolRevenue: "Taker and maker trading fees, sent to the protocol fee collector.",
  SupplySideRevenue: "Builder fees, paid to the approved builders that routed the trades.",
};

const breakdownMethodology = {
  Fees: {
    "Taker Fees": "Fee charged to the taker on each matched trade.",
    "Maker Fees": "Fee charged to makers whose resting orders are filled. Fills against passive liquidity carry no maker fee.",
    "Builder Fees": "Fee charged on trades routed by an approved builder.",
  },
  Revenue: {
    "Taker Fees To Protocol": "Taker fees kept by the protocol.",
    "Maker Fees To Protocol": "Maker fees kept by the protocol.",
  },
  ProtocolRevenue: {
    "Taker Fees To Protocol": "Taker fees sent to the protocol fee collector.",
    "Maker Fees To Protocol": "Maker fees sent to the protocol fee collector.",
  },
  SupplySideRevenue: {
    "Builder Fees To Builders": "Builder fees credited to the approved builder.",
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
