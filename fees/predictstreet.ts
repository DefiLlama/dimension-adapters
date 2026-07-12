import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";

// USDC.e collateral, 6 decimals.
const USDC_E = "0x9cb8142aebbcdc60af7c97af897a67a8f3ca71c2";

// Protocol fee wallet. Fees are charged per-fill on the exchanges and accrue on
// the settlement operator wallets (partly as USDC.e, partly as outcome tokens
// that are redeemed after market resolution); a daily job consolidates all of it
// into this wallet as USDC.e. Counting the USDC.e that arrives here gives the
// protocol's realized fees. Senders are deliberately not filtered: the operator
// wallet pool rotates, and pinning it would silently drop sweeps from new wallets.
const FEE_WALLET = "0x0a3EDDe878fa0f5a9A8c95C8054283Ffb2fb0df2";

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  // skipIndexer: DefiLlama's indexer doesn't cover this chain — go straight to getLogs.
  const received = await addTokensReceived({ options, tokens: [USDC_E], targets: [FEE_WALLET], skipIndexer: true });

  // USDC.e is a $1 stablecoin on a brand-new chain DefiLlama can't auto-price, so
  // value the raw 6-decimal total as CoinGecko usd-coin.
  const raw = Object.values(received.getBalances()).reduce((sum: number, v: any) => sum + Number(v), 0);
  const dailyFees = options.createBalances();
  dailyFees.addCGToken("usd-coin", raw / 1e6, "Trading Fees");

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ADI],
  start: "2026-05-30",
  fetch,
  methodology: {
    Fees: "Trading fees charged on every fill, consolidated daily into the protocol fee wallet as USDC.e.",
    Revenue: "All trading fees are kept by the protocol.",
    ProtocolRevenue: "All trading fees go to the protocol.",
  },
  breakdownMethodology: {
    Fees: { "Trading Fees": "Trading fees charged on every fill, consolidated daily into the protocol fee wallet as USDC.e." },
    Revenue: { "Trading Fees": "All trading fees are kept by the protocol." },
    ProtocolRevenue: { "Trading Fees": "All trading fees go to the protocol." },
  },
};

export default adapter;
