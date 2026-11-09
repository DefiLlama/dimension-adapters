import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// CTFExchange (binary markets) / NegRiskCtfExchange (multi-outcome markets).
// Fees land on rotating operator wallets that sweep to the protocol treasury
// 0x0a3EDDe878fa0f5a9A8c95C8054283Ffb2fb0df2.
const CTF = "0x90EA87493E208A14011EC700Ac9cbAf4d064acc0";
const NEGRISK = "0x79ACbb874dd01044FA38a89c1478E60FaAB40D00";
const EXCHANGES = [CTF, NEGRISK];

const OrderFilled =
  "event OrderFilled(uint64 seq, uint64 batchPosition, bytes32 indexed orderHash, address indexed maker, address indexed taker, uint256 makerAssetId, uint256 takerAssetId, uint256 makerAmountFilled, uint256 takerAmountFilled, uint256 fee, uint256 remainingAfter)";

// Every fill has a USDC.e collateral leg (assetId 0) and an outcome-token leg.
function legs(a: any) {
  if (a.makerAssetId === 0n) return { usdc: a.makerAmountFilled as bigint, qty: a.takerAmountFilled as bigint };
  if (a.takerAssetId === 0n) return { usdc: a.takerAmountFilled as bigint, qty: a.makerAmountFilled as bigint };
  return null;
}

// makerAssetId 0 = the maker pays collateral = buying.
const isBuy = (a: any) => a.makerAssetId === 0n;

const EXCHANGE_SET = new Set(EXCHANGES.map((a) => a.toLowerCase()));

// USDC.e is $1 but unpriced on ADI, so amounts book as CoinGecko usd-coin.
// Split the bigint before converting to keep precision past Number.MAX_SAFE_INTEGER.
const toUnits = (amount: bigint) => Number(amount / 1_000_000n) + Number(amount % 1_000_000n) / 1e6;

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyNotionalVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const logs = await options.getLogs({
    targets: EXCHANGES,
    eventAbi: OrderFilled,
    flatten: true,
    entireLog: true,
    parseLog: true,
  });

  // Every leg of a match shares a batchPosition. The two exchanges number their
  // batches independently, so the emitter is part of the key.
  const matches = new Map<string, any[]>();
  for (const log of logs) {
    const key = `${log.address}:${log.transactionHash}:${log.args.batchPosition}`;
    if (!matches.has(key)) matches.set(key, []);
    matches.get(key).push(log);
  }

  for (const group of matches.values()) {
    // The exchange emits the taker leg with itself as taker.
    const takerLeg = group.find((l) => EXCHANGE_SET.has(l.args.taker.toLowerCase()));

    for (const log of group) {
      const a = log.args;
      const lg = legs(a);
      // Neither leg was USDC.e — surface it instead of silently understating volume.
      if (!lg) {
        console.error(`predictstreet: unexpected OrderFilled leg shape`);
        continue;
      }

      // An opposite-side maker leg mirrors the taker's fill — the same collateral
      // reported twice. A same-side maker leg is a mint (two buyers) or merge (two
      // sellers), where each side funds its own half, so both legs count.
      if (!takerLeg || log === takerLeg || isBuy(a) === isBuy(takerLeg.args)) {
        dailyVolume.addCGToken("usd-coin", toUnits(lg.usdc));
        dailyNotionalVolume.addCGToken("usd-coin", toUnits(lg.qty));
      }

      // Every order is charged its own fee, so no halving here. SELL pays in
      // USDC.e, BUY in outcome shares valued at the fill price.
      const fee = toUnits(a.fee as bigint);
      if (a.takerAssetId === 0n) dailyFees.addCGToken("usd-coin", fee, METRIC.TRADING_FEES);
      else if (lg.qty > 0n) dailyFees.addCGToken("usd-coin", fee * (toUnits(lg.usdc) / toUnits(lg.qty)), METRIC.TRADING_FEES);
    }
  }

  return { dailyVolume, dailyNotionalVolume, dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ADI],
  start: "2026-05-30",
  fetch,
  methodology: {
    Volume:
      "USDC.e paid to buy outcome shares and received from selling them. When a buyer trades with a seller the same money is reported by both of them, so it is only counted once. When two buyers are matched a new pair of shares is created, and when two sellers are matched a pair is redeemed — in those trades each side puts up its own money, so both sides are counted.",
    NotionalVolume:
      "Outcome shares traded, where each share pays $1 if its outcome wins. Counted on the same basis as volume: once for a buyer-versus-seller trade, and on both sides when two buyers or two sellers are matched.",
    Fees:
      "Trading fee taken out of each filled order's proceeds. Sellers pay it in USDC.e; buyers pay it in outcome shares, valued at the price they traded at. Both sides of a trade are charged.",
    Revenue:
      "All trading fees. predictstreet keeps the full fee — there are no maker or liquidity-provider rebates.",
    ProtocolRevenue:
      "All trading fees. Predictstreet keeps the full fee — there are no maker or liquidity-provider rebates.",
  },
  breakdownMethodology: {
    Fees: {
      "Trading Fees": "Trading fee taken out of each filled order's proceeds. Sellers pay it in USDC.e; buyers pay it in outcome shares, valued at the price they traded at. Both sides of a trade are charged.",
    },
    Revenue: {
      "Trading Fees": "All trading fees. Predictstreet keeps the full fee — there are no maker or liquidity-provider rebates.",
    },
    ProtocolRevenue: {
      "Trading Fees": "All trading fees. Predictstreet keeps the full fee — there are no maker or liquidity-provider rebates.",
    },
  },
};

export default adapter;
