// Paygram fees / revenue.
// Data: https://usepaygram.com/api/public/v1/stats/day?date=YYYY-MM-DD (exactly-once ledgers).
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const API = "https://usepaygram.com/api/public/v1/stats/day";

const sol = (lamports: number | undefined) => Math.max(0, lamports ?? 0) / 1e9;

const fetch = async (options: FetchOptions) => {
  const date = new Date(options.startOfDay * 1000).toISOString().slice(0, 10);
  const day = await httpGet(`${API}?date=${date}`);
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  // Creator fees collected that day (SOL), split in the same accounting period:
  // fees = revenue (protocol share) + supply side (creator share). Later payouts are not new fees.
  dailyFees.addCGToken("solana", sol(day.feesCollectedLamports));
  dailyUserFees.addCGToken("solana", sol(day.feesCollectedLamports));
  dailyRevenue.addCGToken("solana", sol(day.protocolShareLamports));
  dailySupplySideRevenue.addCGToken("solana", sol(day.creatorShareLamports));

  // Holders revenue = buyback spend actually executed (buy with a verified on-chain $PAYGRAM burn).
  const buySol = sol(day.buybackExecutedLamports);
  const buyUsdc = Math.max(0, day.buybackExecutedMicroUsdc ?? 0) / 1e6;
  if (buySol > 0) dailyHoldersRevenue.addCGToken("solana", buySol);
  if (buyUsdc > 0) dailyHoldersRevenue.addCGToken("usd-coin", buyUsdc);

  return { dailyFees, dailyUserFees, dailyRevenue, dailySupplySideRevenue, dailyHoldersRevenue };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: { [CHAIN.SOLANA]: { fetch, start: "2025-06-01" } },
  methodology: {
    Fees: "Pump.fun creator fees collected by the Paygram routing vault for Paygram launches (fee_claims ledger).",
    UserFees: "Same as fees: paid by traders of Paygram launches.",
    Revenue: "The protocol share (20%) of the fees collected that day. It is used for the $PAYGRAM buyback-and-burn.",
    SupplySideRevenue: "The creator/recipient share (80%) of the fees collected that day, in the same accounting period. Later payouts or claims are not counted again.",
    HoldersRevenue: "Buyback spend actually executed: protocol buys of $PAYGRAM whose tokens were verifiably burned on chain (booked but unspent credits are excluded).",
  },
};

export default adapter;
