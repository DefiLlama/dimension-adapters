import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { pageToncenterTxs, toBigInt } from "../../helpers/ton";

/**
 * GroypFi — DEX Aggregator on TON
 *
 * GroypFi aggregates liquidity across DeDust, STON.fi, Tonco, and Bidask
 * for optimal swap routing on the TON blockchain.
 *
 * Volume sources:
 *   - Swap Widget (web app)
 *   - Terminal Quick Buy (web app)
 *   - Launchpad token trading (web app)
 *   - @groypfi_bot (Telegram trading bot)
 *
 * All swaps carry a 1% platform fee sent to the house fee wallet.
 * Daily volume is reverse-calculated: volume = fee_inflow / 0.01
 *
 * Fee wallet (user-friendly): UQDu4AiT__JKuqT0Znje0RoXIQMPcj4uIGYZme3UK4hFlE_Q
 * Fee wallet (raw):           0:eee00893fff24abaa4f46678ded11a1721030f723e2e20661999edd42b884594
 *
 * Website: https://groypfi.io
 */

const FEE_RECIPIENT = "0:eee00893fff24abaa4f46678ded11a1721030f723e2e20661999edd42b884594";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const start = options.startTimestamp;
  const end = options.endTimestamp;

  let total = 0n;

  // deduped by hash and restricted to [start, end) by the helper
  const txs = await pageToncenterTxs({ account: FEE_RECIPIENT, startTimestamp: start, endTimestamp: end });
  for (const tx of txs) {
    if (tx.description?.action?.success === false) continue;

    const inMsg = tx.in_msg;
    if (!inMsg || inMsg.bounced) continue;
    if (inMsg.destination?.toLowerCase() !== FEE_RECIPIENT.toLowerCase()) continue;

    total += toBigInt(inMsg.value);
  }

  dailyFees.addGasToken(total.toString());
  const dailyVolume = dailyFees.clone(100);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Volume: "DEX aggregation volume reverse-calculated from the 1% platform fee collected at the house fee wallet."+
  "Sources: Swap Widget (web app), Terminal Quick Buy (web app), Launchpad token trading (web app), @groypfi_bot (Telegram trading bot)",
  Fees: "All the inflows to protcol wallet is considered as fees",
  Revenue: "All the inflows to protcol wallet is considered as revenue",
  ProtocolRevenue: "All the inflows to protcol wallet is considered as protocol revenue",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.TON],
  start: "2025-01-04",
  methodology,
  pullHourly: true,
};

export default adapter;
