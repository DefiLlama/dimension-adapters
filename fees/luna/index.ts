// LUNA - on-chain gamified mining on Robinhood Chain.
// Submit to DefiLlama/dimension-adapters as fees/luna/index.ts
//
// Every 60-second round, miners deploy ETH across a 25-square grid. The round
// pot is split by immutable constants in LunaGame:
//
//   WINNERS_BPS    8800  88%  paid to the winning square's miners
//   STAKERS_BPS     800   8%  paid to LUNA stakers as ETH
//   MOTHERLODE_BPS  200   2%  into the Motherlode jackpot (paid back to a
//                             miner when it hits, 1-in-500 per round)
//   ECLIPSE_BPS     100   1%  funds the Eclipse side-game's prize pool
//   ADMIN_BPS       100   1%  protocol fee
//
// Revenue is reported as a single combined figure (Motherlode + Eclipse +
// protocol fee), not broken out per destination.
//
// Everything is read from RoundSettled, which carries the round's actual
// totalDeployed and winnersPot - so fees are measured, not modelled.

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const LUNA_GAME = "0xd1b6D26FD47B2Fad620DfD4c522Fc03590DeF4ff";
const ECLIPSE_GAME = "0x6103b8C107217Dc4da94F977487a02Bd75940f4f";
// Fees are paid in native ETH. The zero address is priced as ETH on this chain.
const ETH = "0x0000000000000000000000000000000000000000";

const RoundSettled =
  "event RoundSettled(uint256 indexed roundId, uint8 winningSquare, bool splitEmission, bool motherlodeHit, bool emptyWin, uint256 totalDeployed, uint256 winnersPot, bytes32 randomness)";

// Eclipse is a second game on the same protocol: players buy beacons at a
// rising price, and each purchase splits POT 50% / DIVIDEND 35% / STAKERS 10%
// / ADMIN 5%. The pot and the dividends are paid back to players, so the fee
// taken is the remaining 15%.
const BeaconBought =
  "event BeaconBought(uint256 indexed roundId, address indexed buyer, uint256 price, uint32 beaconIndex, uint256 pot, uint256 nextPrice)";

const BPS = 10000n;
const STAKERS_BPS = 800n;
const ECLIPSE_STAKERS_BPS = 1000n;
const ECLIPSE_ADMIN_BPS = 500n;

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const logs = await options.getLogs({
    target: LUNA_GAME,
    eventAbi: RoundSettled,
  });

  for (const log of logs) {
    const deployed = BigInt(log.totalDeployed);
    if (deployed === 0n) continue; // round ran with no miners

    // Taken straight from the event rather than derived, so this stays correct
    // even for the rounds that settle on a special path (empty win, split
    // emission, Motherlode hit).
    const fees = deployed - BigInt(log.winnersPot);
    const stakers = (deployed * STAKERS_BPS) / BPS;

    dailyFees.add(ETH, fees);
    dailySupplySideRevenue.add(ETH, stakers);
    dailyHoldersRevenue.add(ETH, stakers);
    dailyRevenue.add(ETH, fees - stakers);
  }

  const beaconLogs = await options.getLogs({
    target: ECLIPSE_GAME,
    eventAbi: BeaconBought,
  });

  for (const log of beaconLogs) {
    const price = BigInt(log.price);
    const stakers = (price * ECLIPSE_STAKERS_BPS) / BPS;
    const admin = (price * ECLIPSE_ADMIN_BPS) / BPS;

    dailyFees.add(ETH, stakers + admin);
    dailySupplySideRevenue.add(ETH, stakers);
    dailyHoldersRevenue.add(ETH, stakers);
    dailyRevenue.add(ETH, admin);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
  };
};

const methodology = {
  Fees: "Two sources. In the mining game, 12% of the ETH deployed each round is withheld from the winning square's payout (8% to LUNA stakers, 2% to the Motherlode jackpot, 1% to the Eclipse prize pool, 1% to the protocol), measured per round from RoundSettled as totalDeployed minus winnersPot. In the Eclipse game, 15% of each beacon purchase is withheld (10% to LUNA stakers, 5% to the protocol); the other 85% goes to the prize pot and to dividends paid back to earlier buyers.",
  Revenue:
    "Fees minus the staker share. From the mining game that is the 2% Motherlode, 1% Eclipse and 1% protocol cut combined - the Motherlode and Eclipse portions being prize pools paid back out to players. From the Eclipse game it is the 5% protocol cut.",
  SupplySideRevenue: "ETH paid to LUNA stakers: 8% of each mining round pot and 10% of each Eclipse beacon purchase.",
  HoldersRevenue: "ETH paid to LUNA stakers: 8% of each mining round pot and 10% of each Eclipse beacon purchase.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-27",
  methodology,
};

export default adapter;
