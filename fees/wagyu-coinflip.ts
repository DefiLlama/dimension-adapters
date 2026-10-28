import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const API = "https://api-beta.wagyu.xyz/v2";
const FEED_SIZE = 25; // rounds returned by /v2/coinflips/recent

const CG_IDS: Record<string, string> = {
  XMR: "monero",
  BTC: "bitcoin",
  SOL: "solana",
  ETH: "ethereum",
  ZEC: "zcash",
};

const METRICS = {
  StakesLost: "Stakes Lost By Players",
  WinningsPaid: "Winnings Paid To Players",
  HouseWinningsToWagyu: "Coinflip Net House Winnings To Wagyu",
};

type Round = { id: string; assetSymbol: string; atomicDecimals: number; stakeAtomic: string; won: boolean; playedAt: string };
type Terms = { assets: { asset: string; feePercent: number | null }[] };

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  const rounds: Round[] = await httpGet(`${API}/coinflips/recent`);
  const terms: Terms = await httpGet(`${API}/coinflips/terms`);

  const oldest = Math.min(...rounds.map((r) => Date.parse(r.playedAt) / 1000));
  if (rounds.length >= FEED_SIZE && oldest > options.startTimestamp)
    throw new Error(`wagyu coinflip feed only reaches back to ${new Date(oldest * 1000).toISOString()}, rounds in the window may be missing`);

  for (const round of rounds) {
    const playedAt = Date.parse(round.playedAt) / 1000;
    if (playedAt < options.startTimestamp || playedAt >= options.endTimestamp) continue;

    const cgId = CG_IDS[round.assetSymbol];
    if (!cgId) throw new Error(`wagyu coinflip: unknown asset ${round.assetSymbol}`);
    const feePercent = terms.assets.find((a) => a.asset === round.assetSymbol.toLowerCase())?.feePercent;
    if (feePercent) throw new Error(`wagyu coinflip: ${round.assetSymbol} now charges a ${feePercent}% intake fee, update the adapter`);

    const stake = Number(round.stakeAtomic) / 10 ** round.atomicDecimals;
    const houseWinnings = round.won ? -stake : stake;
    dailyVolume.addCGToken(cgId, stake);
    if (round.won) dailyFees.addCGToken(cgId, -stake, METRICS.WinningsPaid);
    else dailyFees.addCGToken(cgId, stake, METRICS.StakesLost);
    dailyRevenue.addCGToken(cgId, houseWinnings, METRICS.HouseWinningsToWagyu);
  }

  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone() };
}

const methodology = {
  Volume: "Amount staked on Wagyu coinflip rounds, from Wagyu's public feed of played rounds.",
  Fees: "Net amount players lose to the house on Wagyu coinflip: stakes of lost rounds minus the winnings paid on won rounds. Reported by Wagyu's off-chain feed and not verifiable on-chain.",
  Revenue: "Net coinflip winnings of the house, kept in full by Wagyu as the counterparty to every round.",
  ProtocolRevenue: "Net coinflip winnings of the house, kept in full by Wagyu as the counterparty to every round.",
};

const breakdownMethodology = {
  Fees: {
    [METRICS.StakesLost]: "Stakes of every round the player lost, kept by the house.",
    [METRICS.WinningsPaid]: "Winnings the house paid on every round the player won, shown as a negative amount. Wins pay even money, so this equals the stakes of the won rounds.",
  },
  Revenue: {
    [METRICS.HouseWinningsToWagyu]: "Net coinflip winnings, kept by Wagyu as the house.",
  },
  ProtocolRevenue: {
    [METRICS.HouseWinningsToWagyu]: "Net coinflip winnings, kept by Wagyu as the house.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  // the feed only holds the latest rounds, so the adapter reads the trailing day at run time instead of hourly slices
  pullHourly: false,
  fetch,
  chains: [CHAIN.OFF_CHAIN],
  runAtCurrTime: true,
  allowNegativeValue: true, // the house loses on days players win more rounds than they lose
  methodology,
  breakdownMethodology,
};

export default adapter;
