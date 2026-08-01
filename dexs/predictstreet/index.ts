import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// CTFExchange (binary markets) / NegRiskCtfExchange (multi-outcome markets) — the
// same deployments exchange-service verifies EIP712 signatures against
// (EXCHANGE_CONTRACT_ADDRESS / EXCHANGE_CONTRACT_ADDRESS_NEG_RISK) and chain-watcher
// indexes OrderFilled from (CTF_EXCHANGE_ADDRESS / PREDICTSTREET_NEGRISK_CTF_EXCHANGE_ADDRESS).
//FEE_WALLET = "0x0a3EDDe878fa0f5a9A8c95C8054283Ffb2fb0df2"
const CTF = "0x90EA87493E208A14011EC700Ac9cbAf4d064acc0";
const NEGRISK = "0x79ACbb874dd01044FA38a89c1478E60FaAB40D00";
const EXCHANGES = [CTF, NEGRISK];

const OrderFilled =
  "event OrderFilled(uint64 seq, uint64 batchPosition, bytes32 indexed orderHash, address indexed maker, address indexed taker, uint256 makerAssetId, uint256 takerAssetId, uint256 makerAmountFilled, uint256 takerAmountFilled, uint256 fee, uint256 remainingAfter)";

// One leg of every fill is the USDC.e collateral (assetId 0, same for binary and
// neg-risk), the other is the outcome token.
function legs(a: any) {
  if (a.makerAssetId === 0n) return { usdc: a.makerAmountFilled as bigint, qty: a.takerAmountFilled as bigint };
  if (a.takerAssetId === 0n) return { usdc: a.takerAmountFilled as bigint, qty: a.makerAmountFilled as bigint };
  return null;
}

// USDC.e is a $1 stablecoin on a brand-new chain DefiLlama can't auto-price, so
// amounts are priced as CoinGecko usd-coin. Divide the bigint before converting so
// a very large amount can't lose precision crossing Number.MAX_SAFE_INTEGER.
const toUnits = (amount: bigint) => Number(amount / 1_000_000n) + Number(amount % 1_000_000n) / 1e6;

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyNotionalVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const logs = await options.getLogs({ targets: EXCHANGES, eventAbi: OrderFilled, flatten: true });

  for (const log of logs) {
    const lg = legs(log);
    // Neither leg was USDC.e — an unexpected fill shape (bug or future exchange
    // upgrade). Log it: silently dropping the fill would understate volume with
    // no trace of why.
    if (!lg) {
      console.error(`predictstreet: unexpected OrderFilled leg shape`);
      continue;
    }
    dailyVolume.addCGToken("usd-coin", toUnits(lg.usdc) / 2);
    dailyNotionalVolume.addCGToken("usd-coin", toUnits(lg.qty) / 2);

    // Each order pays its own fee (both legs are real charges, not a mirrored
    // double-emit like volume) so no ÷2. SELL leg (takerAssetId 0): fee in
    // USDC.e. BUY leg (makerAssetId 0): fee in outcome shares, valued at fill price.
    const fee = toUnits(log.fee as bigint);
    if (log.takerAssetId === 0n) dailyFees.addCGToken("usd-coin", fee, METRIC.TRADING_FEES);
    else if (lg.qty > 0n) dailyFees.addCGToken("usd-coin", fee * (toUnits(lg.usdc) / toUnits(lg.qty)), METRIC.TRADING_FEES);
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
      "USDC.e collateral traded from OrderFilled events on the CTFExchange and NegRiskCtfExchange.",
    NotionalVolume:
      "Outcome-token shares traded (each share pays $1 if its outcome wins), summed across every fill's outcome leg.",
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
