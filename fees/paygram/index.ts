// Paygram fees / revenue.
// Data: https://usepaygram.com/api/public/v1/stats/day?date=YYYY-MM-DD (exactly-once ledgers).
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const API = "https://usepaygram.com/api/public/v1/stats/day";

const fetch = async (options: FetchOptions) => {
  const date = new Date(options.startOfDay * 1000).toISOString().slice(0, 10);
  const day = await httpGet(`${API}?date=${date}`);
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  // Creator fees collected (SOL). Creators are paid out of these; the protocol share buys and burns $PAYGRAM.
  dailyFees.addCGToken("solana", day.feesCollectedLamports / 1e9);
  dailyUserFees.addCGToken("solana", day.feesCollectedLamports / 1e9);
  // Revenue = the protocol share actually applied to the $PAYGRAM buyback/burn
  // (protocol_credits), SOL + USDC. Creator escrow (owed, unclaimed) is never revenue.
  const revSol = Math.max(0, day.protocolRevenueLamports ?? 0) / 1e9;
  const revUsdc = Math.max(0, day.protocolRevenueMicroUsdc ?? 0) / 1e6;
  for (const b of [dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue]) {
    if (revSol > 0) b.addCGToken("solana", revSol);
    if (revUsdc > 0) b.addCGToken("usd-coin", revUsdc);
  }
  return { dailyFees, dailyUserFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: { [CHAIN.SOLANA]: { fetch, start: "2025-06-01" } },
  methodology: {
    Fees: "Pump.fun creator fees collected by the Paygram routing vault for Paygram launches (fee_claims ledger).",
    UserFees: "Same as fees: paid by traders of Paygram launches.",
    Revenue: "The protocol share of collected fees actually used to buy back and burn $PAYGRAM (protocol_credits ledger, SOL + USDC). Creator shares, paid or still escrowed, are excluded.",
    ProtocolRevenue: "Same as revenue: the protocol share applied to the $PAYGRAM buyback.",
    HoldersRevenue: "The bought-back $PAYGRAM is burned, so the full protocol revenue accrues to $PAYGRAM holders.",
  },
};

export default adapter;
