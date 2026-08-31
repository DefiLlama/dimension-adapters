// Orchard — fees & revenue adapter.
//
// Orchard is a plot game on Robinhood Chain (chainId 4663). Players plant ETH on a
// 5x5 grid; the ETH is swapped to AAPL (Apple stock token) inside the same transaction,
// so the game is played in AAPL. Every 75s round one plot blooms and whoever planted
// there splits the harvest from the other 24 plots.
//
// Contracts (Robinhood Chain):
//   Orchard: 0xEbB8b167c0992cFdc497A995a8Cf7167acAA0A1A
//   AAPL:    0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9
//
// Two fees are extracted, both in AAPL:
//
// 1. Admin fee, on every plant (Orchard._credit /._creditMany):
//      adminCut = bought * adminFeeBps / BPS   (the configured rate; 1% at time of writing)
//      stake    = bought - adminCut
//    Withdrawn by the owner via collectAdmin(address) -> protocol revenue.
//
// 2. Rake, on every revealed round with a winner (Orchard._reveal):
//      lossPool = totalStake - winningStake
//      rake     = lossPool * rakeBps / BPS     (10% today)
//    split into stakers = rake * STAKERS_BPS / BPS (a fixed 10%, contract constant),
//    jackpot = rake * jackpotBps / BPS (50% today), treasury = the remainder (40% today).
//
// rakeBps and jackpotBps are owner-adjustable and stored per round, so both are read
// back from rounds(id) instead of being hardcoded — historical rounds keep their own rate.
// adminFeeBps is likewise owner-adjustable; it is resolved per plant from the window's
// opening value plus any AdminFeeBpsSet emitted inside the window.
//
// Rounds where the blooming plot is empty settle through an early return in _reveal:
// no rake is taken at all and the whole pot rolls into the jackpot, so they contribute
// volume but no fees.
//
// The 10% juice on claim(): NOT counted. It is a hardcoded constant that is recycled to
// players who have not claimed yet (juiceIndex) — it never reaches protocol control, so
// it is a player-to-player transfer rather than a fee.

import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getPositionedLogArgs } from "../../helpers/logs";

const ORCHARD = "0xEbB8b167c0992cFdc497A995a8Cf7167acAA0A1A";
const AAPL = "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9";

const BPS = 10000n;
const STAKERS_BPS = 1000n; // Orchard.STAKERS_BPS, a contract constant: 10% of the rake

const RAKE = "Rake";
const ADMIN_FEE = "Admin Fee";
const JACKPOT = "Rake to Jackpot";
const TREASURY_BUYBACK = "Rake to Buyback";
const STAKING_REWARDS = "Rake to Stakers";

const PLANTED =
  "event Planted(address indexed player, uint256 indexed round, uint8 plot, uint256 ethIn, uint256 stake)";
const PLANTED_MANY =
  "event PlantedMany(address indexed player, uint256 indexed startRound, uint16 roundCount, uint32 plotMask, uint256 ethIn, uint256 totalStake)";
const REVEALED =
  "event Revealed(uint256 indexed round, uint8 winningPlot, uint256 winningStake, uint256 netLossPool)";
const ADMIN_FEE_BPS_SET = "event AdminFeeBpsSet(uint16 bps)";

const ROUNDS_ABI =
  "function rounds(uint256) view returns (uint64 sealBlock, bool revealed, bool voided, uint8 winningPlot, uint16 rakeBps, uint16 jackpotBps, uint32 jackpotOdds, uint256 totalStake, uint256 winningStake, uint256 netLossPool, uint256 entryIndex, uint256 jackpotWon)";

// Invert stake -> bought for the admin cut. The contract floors adminCut, so
// stake = bought - floor(bought * bps / BPS); start from the closed form and nudge
// within the flooring error until the contract's math reproduces the emitted stake.
const deriveAdminCut = (stake: bigint, bps: bigint): bigint => {
  if (bps === 0n) return 0n;
  const candidate = (stake * BPS) / (BPS - bps);
  for (let offset = -3n; offset <= 3n; offset++) {
    const bought = candidate + offset;
    if (bought < 0n) continue;
    const cut = (bought * bps) / BPS;
    if (bought - cut === stake) return cut;
  }
  return candidate - stake;
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  // --- 1. plants: ETH wagered (volume) + the admin cut on the AAPL bought ---
  // adminFeeBps is owner-adjustable and is not carried in the Planted events, so the
  // configured rate is resolved per event: start from the value at the window's first
  // block and replay any AdminFeeBpsSet emitted inside the window on top of it. A rate
  // change mid-window therefore applies only to the plants that came after it.
  const startAdminFeeBps = BigInt(
    await options.fromApi.call({ abi: "uint16:adminFeeBps", target: ORCHARD })
  );

  const feeChanges = (await getPositionedLogArgs(options, { target: ORCHARD, eventAbi: ADMIN_FEE_BPS_SET }))
    .map((log: any) => ({
      blockNumber: Number(log.blockNumber),
      logIndex: Number(log.logIndex),
      bps: BigInt(log.bps),
    }))
    .sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);

  // Rate in effect for a log, i.e. the last change emitted strictly before it.
  const rateAt = (blockNumber: number, logIndex: number): bigint => {
    let bps = startAdminFeeBps;
    for (const change of feeChanges) {
      if (
        change.blockNumber > blockNumber ||
        (change.blockNumber === blockNumber && change.logIndex > logIndex)
      )
        break;
      bps = change.bps;
    }
    return bps;
  };

  const planted = await getPositionedLogArgs(options, { target: ORCHARD, eventAbi: PLANTED });
  const plantedMany = await getPositionedLogArgs(options, { target: ORCHARD, eventAbi: PLANTED_MANY });

  const addPlant = (log: any, stake: bigint) => {
    dailyVolume.addGasToken(log.ethIn);
    const bps = rateAt(Number(log.blockNumber), Number(log.logIndex));
    const adminCut = deriveAdminCut(stake, bps);
    dailyFees.add(AAPL, adminCut, ADMIN_FEE);
    dailyRevenue.add(AAPL, adminCut, ADMIN_FEE);
    dailyProtocolRevenue.add(AAPL, adminCut, ADMIN_FEE);
  };

  for (const log of planted) addPlant(log, BigInt(log.stake));
  for (const log of plantedMany) addPlant(log, BigInt(log.totalStake));

  // --- 2. reveals: the rake and its three destinations ---
  // The emitted netLossPool already has any jackpot payout folded in, so the round
  // state is read back instead of deriving the loss pool from the event.
  const revealed = await options.getLogs({ target: ORCHARD, eventAbi: REVEALED });

  if (revealed.length) {
    const rounds = await options.api.multiCall({
      abi: ROUNDS_ABI,
      target: ORCHARD,
      calls: revealed.map((log: any) => ({ params: [log.round.toString()] })),
    });

    for (const round of rounds) {
      const totalStake = BigInt(round.totalStake);
      const winningStake = BigInt(round.winningStake);
      // Empty blooming plot: _reveal returns early, no rake is taken.
      if (winningStake === 0n) continue;

      const rake = ((totalStake - winningStake) * BigInt(round.rakeBps)) / BPS;
      if (rake === 0n) continue;

      const toStakers = (rake * STAKERS_BPS) / BPS;
      const toJackpot = (rake * BigInt(round.jackpotBps)) / BPS;
      const toTreasury = rake - toStakers - toJackpot;

      dailyFees.add(AAPL, toStakers + toJackpot + toTreasury, RAKE);

      // The jackpot is paid back out to players, so it is a cost of revenue.
      dailySupplySideRevenue.add(AAPL, toJackpot, JACKPOT);

      dailyRevenue.add(AAPL, toStakers, STAKING_REWARDS);
      dailyRevenue.add(AAPL, toTreasury, TREASURY_BUYBACK);

      // Both destinations end up with SEED holders: the stakers' cut is flushed to
      // SeedStaking as AAPL yield, the treasury cut buys SEED back and burns it.
      dailyHoldersRevenue.add(AAPL, toStakers, STAKING_REWARDS);
      dailyHoldersRevenue.add(AAPL, toTreasury, TREASURY_BUYBACK);
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
    dailyProtocolRevenue,
  };
};

const methodology = {
  Volume: "Total ETH planted on the grid, taken from the Planted and PlantedMany events.",
  Fees:
    "Every plant pays an admin fee, at the configured adminFeeBps rate (1% at time of writing), on the AAPL bought with it. Every revealed round with a winner pays that round's configured rakeBps on the loss pool (the stakes on the 24 plots that did not bloom), split into a fixed 10% to SEED stakers (STAKERS_BPS, a contract constant), the round's configured jackpotBps share to the Golden Apple jackpot, and the remainder to the treasury. Rounds where the blooming plot is empty take no rake — the whole pot rolls into the jackpot.",
  UserFees: "Same as Fees — both the admin fee and the rake are paid by players out of what they planted.",
  Revenue: "Gross profit: the admin fee plus the stakers and treasury cuts of the rake. The jackpot cut is excluded because it is paid back out to players.",
  ProtocolRevenue: "The admin fee taken on every plant at the configured adminFeeBps rate, withdrawn by the owner via collectAdmin.",
  HoldersRevenue:
    "Value reaching SEED holders: the fixed 10% of each round's rake flushed to SeedStaking as AAPL yield for stakers, plus the treasury remainder that buys SEED back on the DEX and burns it.",
  SupplySideRevenue: "The round's configured jackpotBps share of its rake, routed to the Golden Apple jackpot and paid back out to players when it hits.",
};

const breakdownMethodology = {
  Fees: {
    [ADMIN_FEE]: "The configured adminFeeBps share of the AAPL bought on every plant (Planted and PlantedMany events), resolved per event so rate changes apply only from the block they take effect.",
    RAKE: "The rake taken on every revealed round with a winner.",
  },
  UserFees: {
    [ADMIN_FEE]: "The configured adminFeeBps share of the AAPL bought on every plant (Planted and PlantedMany events), resolved per event so rate changes apply only from the block they take effect.",
    RAKE: "The rake taken on every revealed round with a winner.",
  },
  Revenue: {
    [ADMIN_FEE]: "Admin fee on every plant, at the configured adminFeeBps rate.",
    [STAKING_REWARDS]: "The fixed 10% staker share of each round's rake.",
    [TREASURY_BUYBACK]: "The treasury remainder of each round's rake used to buy SEED back on the DEX and burn it.",
  },
  ProtocolRevenue: {
    [ADMIN_FEE]: "Admin fee on every plant at the configured adminFeeBps rate, withdrawn by the owner via collectAdmin.",
  },
  HoldersRevenue: {
    [STAKING_REWARDS]: "The fixed 10% staker share of each round's rake, flushed to SeedStaking as AAPL yield for SEED stakers.",
    [TREASURY_BUYBACK]: "The treasury remainder of each round's rake, spent buying SEED back on the DEX and burning it.",
  },
  SupplySideRevenue: {
    [JACKPOT]: "The round's configured jackpotBps share of its rake, routed to the Golden Apple jackpot and paid back out to players when it hits.",
  },
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-22",
  methodology,
  breakdownMethodology,
};

export default adapter;
