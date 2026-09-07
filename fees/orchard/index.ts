// Orchard — fees & revenue adapter.
//
// Orchard is a plot game on Robinhood Chain (chainId 4663), played in AAPL (Apple stock
// token). Players plant on a 5x5 grid; every 75s round one plot blooms and whoever planted
// there splits the harvest from the other 24 plots. Two versions of the game contract run
// side by side and are summed here:
//
//   Orchard v1: 0xEbB8b167c0992cFdc497A995a8Cf7167acAA0A1A  (since 2026-07-22)
//   Orchard v2: 0x86510b3df745C67a993A66CB08720Ed158d44549  (since 2026-09-03)
//   AAPL:       0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9
//
// Two fees are extracted, both in AAPL:
//
// 1. Admin fee, withdrawn by the owner via collectAdmin(address) -> protocol revenue.
//    - v1 takes it on every plant (Orchard._credit /._creditMany): the ETH is swapped to
//      AAPL inside the plant transaction and adminCut = bought * adminFeeBps / BPS is carved
//      out of it, so stake = bought - adminCut. Reconstructed per Planted event.
//    - v2 takes it when the keeper seals a round (OrchardV2.seal): the whole round's ETH is
//      swapped to AAPL at once and adminFeeBps is carved out of what was bought; plants made
//      from a player's AAPL balance pay the same rate on their value, and batched plants pay
//      an extra batchFeeBps (0 at time of writing) on top. All of it lands in adminAccrued,
//      so it is measured exactly as the growth of adminAccrued over the window plus whatever
//      collectAdmin withdrew inside it.
//
// 2. Rake, identical in both versions, on every revealed round with a winner (v1 _reveal,
//    v2 _settle):
//      lossPool = totalStake - winningStake
//      rake     = lossPool * rakeBps / BPS     (10% today)
//    split into stakers = rake * STAKERS_BPS / BPS (a fixed 10%, contract constant),
//    jackpot = rake * jackpotBps / BPS (50% today), treasury = the remainder (40% today).
//
// rakeBps and jackpotBps are owner-adjustable and stored per round, so both are read back
// from the round (v1 rounds(id), v2 getRound(id)) instead of being hardcoded — historical
// rounds keep their own rate. v1's adminFeeBps is likewise owner-adjustable and is not
// carried in the Planted events; it is resolved per plant from the window's opening value
// plus any AdminFeeBpsSet emitted inside the window.
//
// Rounds where the blooming plot is empty settle through an early return: no rake is taken
// at all and the whole pot rolls into the jackpot, so they contribute volume but no fees.
//
// The 10% juice on claim(): NOT counted. It is a hardcoded constant that is recycled to
// players who have not claimed yet (juiceIndex; on v2 a slice is also reserved for v1
// players bridging their harvest over) — it never reaches protocol control, so it is a
// player-to-player transfer rather than a fee.

import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getPositionedLogArgs } from "../../helpers/logs";

const ORCHARD_V1 = "0xEbB8b167c0992cFdc497A995a8Cf7167acAA0A1A";
const ORCHARD_V2 = "0x86510b3df745C67a993A66CB08720Ed158d44549";
const ORCHARD_V2_DEPLOY_BLOCK = 53786732;
const AAPL = "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9";

const BPS = 10000n;
const STAKERS_BPS = 1000n; // Orchard.STAKERS_BPS, a contract constant in both versions: 10% of the rake
const FLAG_AAPL = 1n; // OrchardV2.FLAG_AAPL: the entry was planted from the player's AAPL balance, not ETH

const RAKE = "Rake";
const ADMIN_FEE = "Admin Fee";
const JACKPOT = "Rake to Jackpot";
const TREASURY_BUYBACK = "Rake to Buyback";
const STAKING_REWARDS = "Rake to Stakers";

// v1
const PLANTED =
  "event Planted(address indexed player, uint256 indexed round, uint8 plot, uint256 ethIn, uint256 stake)";
const PLANTED_MANY =
  "event PlantedMany(address indexed player, uint256 indexed startRound, uint16 roundCount, uint32 plotMask, uint256 ethIn, uint256 totalStake)";
const ADMIN_FEE_BPS_SET = "event AdminFeeBpsSet(uint16 bps)";
const ROUNDS_ABI =
  "function rounds(uint256) view returns (uint64 sealBlock, bool revealed, bool voided, uint8 winningPlot, uint16 rakeBps, uint16 jackpotBps, uint32 jackpotOdds, uint256 totalStake, uint256 winningStake, uint256 netLossPool, uint256 entryIndex, uint256 jackpotWon)";

// v2
const V2_PLANTED =
  "event Planted(address indexed player, uint256 indexed round, uint32 plotMask, uint96 value, uint8 flags)";
const ADMIN_COLLECTED = "event AdminCollected(address indexed to, uint256 aaplAmount)";
const GET_ROUND_ABI =
  "function getRound(uint256) view returns ((bytes32 root, uint96 totalEth, uint96 netAapl, uint64 sealBlock, uint96 totalStake, bool revealed, bool voided, uint8 winningPlot, uint16 rakeBps, uint16 adminFeeBps, uint16 batchFeeBps, uint16 jackpotBps, uint32 jackpotOdds, uint128 winningStake, uint128 netLossPool, uint256 entryIndex, uint256 jackpotWon))";

// both
const REVEALED =
  "event Revealed(uint256 indexed round, uint8 winningPlot, uint256 winningStake, uint256 netLossPool)";

type Ledger = {
  dailyVolume: ReturnType<FetchOptions["createBalances"]>;
  dailyFees: ReturnType<FetchOptions["createBalances"]>;
  dailyRevenue: ReturnType<FetchOptions["createBalances"]>;
  dailySupplySideRevenue: ReturnType<FetchOptions["createBalances"]>;
  dailyHoldersRevenue: ReturnType<FetchOptions["createBalances"]>;
  dailyProtocolRevenue: ReturnType<FetchOptions["createBalances"]>;
};

// Invert stake -> bought for the v1 admin cut. The contract floors adminCut, so
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

const addAdminFee = (ledger: Ledger, amount: bigint) => {
  if (amount === 0n) return;
  ledger.dailyFees.add(AAPL, amount, ADMIN_FEE);
  ledger.dailyRevenue.add(AAPL, amount, ADMIN_FEE);
  ledger.dailyProtocolRevenue.add(AAPL, amount, ADMIN_FEE);
};

// The rake and its three destinations, from the round state read back after the reveal.
// The emitted netLossPool already has any jackpot payout folded in, which is why the round
// is read instead of deriving the loss pool from the event. Same split in both versions.
const addRake = (ledger: Ledger, rounds: any[]) => {
  for (const round of rounds) {
    const totalStake = BigInt(round.totalStake);
    const winningStake = BigInt(round.winningStake);
    // Empty blooming plot: the settle returns early, no rake is taken.
    if (winningStake === 0n) continue;

    const rake = ((totalStake - winningStake) * BigInt(round.rakeBps)) / BPS;
    if (rake === 0n) continue;

    const toStakers = (rake * STAKERS_BPS) / BPS;
    const toJackpot = (rake * BigInt(round.jackpotBps)) / BPS;
    const toTreasury = rake - toStakers - toJackpot;

    ledger.dailyFees.add(AAPL, toStakers + toJackpot + toTreasury, RAKE);

    // The jackpot is paid back out to players, so it is a cost of revenue.
    ledger.dailySupplySideRevenue.add(AAPL, toJackpot, JACKPOT);

    ledger.dailyRevenue.add(AAPL, toStakers, STAKING_REWARDS);
    ledger.dailyRevenue.add(AAPL, toTreasury, TREASURY_BUYBACK);

    // Both destinations end up with SEED holders: the stakers' cut is flushed to
    // SeedStaking as AAPL yield, the treasury cut buys SEED back and burns it.
    ledger.dailyHoldersRevenue.add(AAPL, toStakers, STAKING_REWARDS);
    ledger.dailyHoldersRevenue.add(AAPL, toTreasury, TREASURY_BUYBACK);
  }
};

const fetchV1 = async (options: FetchOptions, ledger: Ledger) => {
  // --- 1. plants: ETH wagered (volume) + the admin cut on the AAPL bought ---
  // adminFeeBps is owner-adjustable and is not carried in the Planted events, so the
  // configured rate is resolved per event: start from the value at the window's first
  // block and replay any AdminFeeBpsSet emitted inside the window on top of it. A rate
  // change mid-window therefore applies only to the plants that came after it.
  const startAdminFeeBps = BigInt(
    await options.fromApi.call({ abi: "uint16:adminFeeBps", target: ORCHARD_V1 })
  );

  const feeChanges = (await getPositionedLogArgs(options, { target: ORCHARD_V1, eventAbi: ADMIN_FEE_BPS_SET }))
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

  const planted = await getPositionedLogArgs(options, { target: ORCHARD_V1, eventAbi: PLANTED });
  const plantedMany = await getPositionedLogArgs(options, { target: ORCHARD_V1, eventAbi: PLANTED_MANY });

  const addPlant = (log: any, stake: bigint) => {
    ledger.dailyVolume.addGasToken(log.ethIn);
    const bps = rateAt(Number(log.blockNumber), Number(log.logIndex));
    addAdminFee(ledger, deriveAdminCut(stake, bps));
  };

  for (const log of planted) addPlant(log, BigInt(log.stake));
  for (const log of plantedMany) addPlant(log, BigInt(log.totalStake));

  // --- 2. reveals: the rake ---
  const revealed = await options.getLogs({ target: ORCHARD_V1, eventAbi: REVEALED });
  if (!revealed.length) return;

  const rounds = await options.api.multiCall({
    abi: ROUNDS_ABI,
    target: ORCHARD_V1,
    calls: revealed.map((log: any) => ({ params: [log.round.toString()] })),
  });
  addRake(ledger, rounds);
};

const fetchV2 = async (options: FetchOptions, ledger: Ledger) => {
  const [fromBlock, toBlock] = await Promise.all([options.getFromBlock(), options.getToBlock()]);
  if (toBlock < ORCHARD_V2_DEPLOY_BLOCK) return;

  // --- 1. plants: what was wagered (volume). value is ETH, or AAPL when FLAG_AAPL is set ---
  // Planted is emitted once per entry whatever the entry point (plant, plantMany,
  // plantBatch, standing orders), so it is the single source for volume.
  const planted = await options.getLogs({ target: ORCHARD_V2, eventAbi: V2_PLANTED });
  for (const log of planted) {
    if (BigInt(log.flags) & FLAG_AAPL) ledger.dailyVolume.add(AAPL, log.value);
    else ledger.dailyVolume.addGasToken(log.value);
  }

  // --- 2. seals: the admin fee ---
  // Every admin-fee component of a seal (the cut on the AAPL bought for the round, the same
  // rate on AAPL-denominated plants, the batch fee on batched plants) is added to
  // adminAccrued, and collectAdmin is the only thing that ever decreases it. The fee taken
  // inside the window is therefore the growth of adminAccrued plus the withdrawals, which
  // captures the exact on-chain flooring without replaying the round's entry list.
  // Consecutive windows share their boundary block, so the state delta covers
  // (fromBlock, toBlock] and withdrawals emitted at fromBlock itself are left to the
  // previous window.
  const adminBefore =
    fromBlock < ORCHARD_V2_DEPLOY_BLOCK
      ? 0n
      : BigInt(await options.fromApi.call({ abi: "uint256:adminAccrued", target: ORCHARD_V2 }));
  const adminAfter = BigInt(await options.api.call({ abi: "uint256:adminAccrued", target: ORCHARD_V2 }));
  const collected = (await getPositionedLogArgs(options, { target: ORCHARD_V2, eventAbi: ADMIN_COLLECTED }))
    .filter((log: any) => Number(log.blockNumber) > fromBlock)
    .reduce((sum: bigint, log: any) => sum + BigInt(log.aaplAmount), 0n);
  addAdminFee(ledger, adminAfter - adminBefore + collected);

  // --- 3. reveals: the rake ---
  const revealed = await options.getLogs({ target: ORCHARD_V2, eventAbi: REVEALED });
  if (!revealed.length) return;

  const rounds = await options.api.multiCall({
    abi: GET_ROUND_ABI,
    target: ORCHARD_V2,
    calls: revealed.map((log: any) => ({ params: [log.round.toString()] })),
  });
  addRake(ledger, rounds);
};

const fetch = async (options: FetchOptions) => {
  const ledger: Ledger = {
    dailyVolume: options.createBalances(),
    dailyFees: options.createBalances(),
    dailyRevenue: options.createBalances(),
    dailySupplySideRevenue: options.createBalances(),
    dailyHoldersRevenue: options.createBalances(),
    dailyProtocolRevenue: options.createBalances(),
  };

  await fetchV1(options, ledger);
  await fetchV2(options, ledger);

  return {
    ...ledger,
    dailyUserFees: ledger.dailyFees,
  };
};

const methodology = {
  Volume:
    "Everything planted on the grid across both game versions: ETH from the v1 Planted and PlantedMany events, and ETH or AAPL from the v2 Planted events (v2 lets players plant from an AAPL balance).",
  Fees:
    "Every plant pays an admin fee at the configured adminFeeBps rate (1% at time of writing) on the AAPL it buys — taken inside the plant on v1, and at the round's seal on v2 (where AAPL-denominated plants pay the same rate on their value and batched plants an extra batchFeeBps, 0 at time of writing). Every revealed round with a winner pays that round's configured rakeBps on the loss pool (the stakes on the 24 plots that did not bloom), split into a fixed 10% to SEED stakers (STAKERS_BPS, a contract constant), the round's configured jackpotBps share to the Golden Apple jackpot, and the remainder to the treasury. Rounds where the blooming plot is empty take no rake — the whole pot rolls into the jackpot.",
  UserFees: "Same as Fees — both the admin fee and the rake are paid by players out of what they planted.",
  Revenue: "Gross profit: the admin fee plus the stakers and treasury cuts of the rake. The jackpot cut is excluded because it is paid back out to players.",
  ProtocolRevenue:
    "The admin fee, withdrawn by the owner via collectAdmin: reconstructed per plant on v1, and on v2 measured as the growth of adminAccrued over the window plus the amounts withdrawn inside it.",
  HoldersRevenue:
    "Value reaching SEED holders: the fixed 10% of each round's rake flushed to SeedStaking as AAPL yield for stakers, plus the treasury remainder that buys SEED back on the DEX and burns it.",
  SupplySideRevenue: "The round's configured jackpotBps share of its rake, routed to the Golden Apple jackpot and paid back out to players when it hits.",
};

const breakdownMethodology = {
  Fees: {
    [ADMIN_FEE]: "The configured adminFeeBps share of the AAPL bought with every plant: per Planted/PlantedMany event on v1, and per sealed round on v2 (as the growth of adminAccrued plus collectAdmin withdrawals, which also carries the v2 batch fee).",
    RAKE: "The rake taken on every revealed round with a winner, on both versions.",
  },
  UserFees: {
    [ADMIN_FEE]: "The configured adminFeeBps share of the AAPL bought with every plant: per Planted/PlantedMany event on v1, and per sealed round on v2 (as the growth of adminAccrued plus collectAdmin withdrawals, which also carries the v2 batch fee).",
    RAKE: "The rake taken on every revealed round with a winner, on both versions.",
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
