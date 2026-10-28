import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { METRIC } from "../../helpers/metrics";

// LUNA — on-chain gamified mining on Robinhood Chain (Arbitrum Orbit L2, chainId 4663).
// Native wager token is ETH. Two games feed this adapter, both read from event logs.
//
// MINING. Every 60 seconds miners deploy ETH across a 25-square grid. Each settled round
// takes a flat 12% from the pot, split by immutable constants in LunaGame: 8% to LUNA
// stakers, 2% to the Motherlode jackpot, 1% to the Eclipse prize pool and 1% retained by
// the protocol. The winning square's miners keep the other 88%.
//
// ECLIPSE. Players buy beacons at a rising price. Each purchase splits 50% to the prize
// pot, 35% to dividends for earlier buyers, 10% to LUNA stakers and 5% to the protocol.
// The pot and the dividends are paid back out to players, so the fee taken is the
// remaining 15%.
const LUNA_GAME = "0xd1b6D26FD47B2Fad620DfD4c522Fc03590DeF4ff";
const ECLIPSE_GAME = "0x6103b8C107217Dc4da94F977487a02Bd75940f4f";

const ROUND_SETTLED =
  "event RoundSettled(uint256 indexed roundId, uint8 winningSquare, bool splitEmission, bool motherlodeHit, bool emptyWin, uint256 totalDeployed, uint256 winnersPot, bytes32 randomness)";
const BEACON_BOUGHT =
  "event BeaconBought(uint256 indexed roundId, address indexed buyer, uint256 price, uint32 beaconIndex, uint256 pot, uint256 nextPrice)";

const PRIZE_POOLS = "Prize Pools"; // Motherlode jackpot + Eclipse prize pool, paid back out to players

const BPS = 10000n;
const STAKERS_BPS = 800n;
const ADMIN_BPS = 100n;
const ECLIPSE_STAKERS_BPS = 1000n;
const ECLIPSE_ADMIN_BPS = 500n;

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const rounds = await options.getLogs({ targets: [LUNA_GAME], eventAbi: ROUND_SETTLED });
  for (const log of rounds) {
    const deployed = BigInt(log.totalDeployed);
    if (deployed === 0n) continue; // round ran with no miners

    // Taken from the event rather than derived from the constants, so this stays correct
    // for rounds that settle on a special path (empty win, split emission, Motherlode hit).
    const fees = deployed - BigInt(log.winnersPot);
    const stakers = (deployed * STAKERS_BPS) / BPS;
    const admin = (deployed * ADMIN_BPS) / BPS;
    const prizePools = fees - stakers - admin; // Motherlode + Eclipse prize pool

    dailyFees.addGasToken(stakers, METRIC.STAKING_REWARDS);
    dailyFees.addGasToken(admin, METRIC.PROTOCOL_FEES);
    dailyFees.addGasToken(prizePools, PRIZE_POOLS);

    dailyRevenue.addGasToken(stakers, METRIC.STAKING_REWARDS);
    dailyRevenue.addGasToken(admin, METRIC.PROTOCOL_FEES);
    dailyHoldersRevenue.addGasToken(stakers, METRIC.STAKING_REWARDS);
    dailyProtocolRevenue.addGasToken(admin, METRIC.PROTOCOL_FEES);
    dailySupplySideRevenue.addGasToken(prizePools, PRIZE_POOLS);
  }

  const beacons = await options.getLogs({ targets: [ECLIPSE_GAME], eventAbi: BEACON_BOUGHT });
  for (const log of beacons) {
    const price = BigInt(log.price);
    const stakers = (price * ECLIPSE_STAKERS_BPS) / BPS;
    const admin = (price * ECLIPSE_ADMIN_BPS) / BPS;

    dailyFees.addGasToken(stakers, METRIC.STAKING_REWARDS);
    dailyFees.addGasToken(admin, METRIC.PROTOCOL_FEES);

    dailyRevenue.addGasToken(stakers, METRIC.STAKING_REWARDS);
    dailyRevenue.addGasToken(admin, METRIC.PROTOCOL_FEES);
    dailyHoldersRevenue.addGasToken(stakers, METRIC.STAKING_REWARDS);
    dailyProtocolRevenue.addGasToken(admin, METRIC.PROTOCOL_FEES);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "The 12% taken from every mining round's pot (8% to LUNA stakers, 2% to the Motherlode jackpot, 1% to the Eclipse prize pool, 1% to the protocol), plus the 15% taken from every Eclipse beacon purchase (10% to stakers, 5% to the protocol).",
  Revenue: "ETH distributed to LUNA stakers plus the protocol's retained cut.",
  ProtocolRevenue: "The 1% of each mining round pot and 5% of each Eclipse beacon purchase retained by the protocol.",
  HoldersRevenue: "ETH distributed to LUNA stakers — 8% of each mining round pot and 10% of each beacon purchase.",
  SupplySideRevenue: "The 2% Motherlode jackpot and 1% Eclipse prize pool funded by each mining round, both paid back out to players.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.STAKING_REWARDS]: "8% of each mining round pot and 10% of each Eclipse beacon purchase, distributed to LUNA stakers.",
    [METRIC.PROTOCOL_FEES]: "1% of each mining round pot and 5% of each Eclipse beacon purchase, retained by the protocol.",
    [PRIZE_POOLS]: "2% of each mining round pot to the Motherlode jackpot and 1% to the Eclipse prize pool.",
  },
  Revenue: {
    [METRIC.STAKING_REWARDS]: "8% of each mining round pot and 10% of each beacon purchase, distributed to LUNA stakers.",
    [METRIC.PROTOCOL_FEES]: "1% of each mining round pot and 5% of each beacon purchase, retained by the protocol.",
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_FEES]: "1% of each mining round pot and 5% of each beacon purchase.",
  },
  HoldersRevenue: {
    [METRIC.STAKING_REWARDS]: "8% of each mining round pot and 10% of each beacon purchase, distributed to LUNA stakers.",
  },
  SupplySideRevenue: {
    [PRIZE_POOLS]: "The 2% Motherlode jackpot and 1% Eclipse prize pool, paid back out to players.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-27",
  methodology,
  breakdownMethodology,
};

export default adapter;
