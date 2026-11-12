import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Kalos Fate (https://www.kalos.fun) on Kinetiq Elysium: an NFT chance game against a house bankroll.
// A player picks a KalosMarket listing and pays a stake of payBps of its price for a winBps = payBps - 100 chance to win
// it (EDGE_BPS = 100, a 1% edge). A keeper settles each attempt with a draw: a loss leaves the stake to the house; a win
// makes the house buy the listing on KalosMarket and send the NFT to the player; an attempt that cannot be filled is refunded.
// KalosFateHouse (proxy 0xCA10517731a5D3709b40A76DdF382A647852d6ac, implementation 0xcA1055187544CB05dE2EEceaE1eCf4E2810B96E6)
// holds the native HYPE bankroll, deposited against kFATE shares by approved depositors only.
const FATE_HOUSE = '0xCA10517731a5D3709b40A76DdF382A647852d6ac';
const FATE_START = '2026-11-09'; // first attempt entered in block 3,311,832

const AttemptEnteredEvent = 'event AttemptEntered(uint256 indexed attemptId, address indexed buyer, address indexed collection, uint256 tokenId, address seller, uint128 price, uint128 stake, uint16 payBps, uint16 winBps, uint64 listingExpiry, uint64 deadline)';
const AttemptSettledEvent = 'event AttemptSettled(uint256 indexed attemptId, address indexed buyer, uint8 status, uint16 draw, uint8 reason)';
const GET_ATTEMPT = 'function getAttempt(uint256 id) view returns (tuple(address buyer, address collection, address seller, uint256 tokenId, uint128 price, uint128 stake, uint64 listingExpiry, uint64 deadline, uint16 payBps, uint16 winBps, uint16 draw, uint8 status, uint8 refundReason))';
const STATUS_WON = 2;
const STATUS_LOST = 3;

const LABEL = 'Fate Gross Gaming Revenue';

/** Fate stakes entered in the window, and the house result of attempts settled in the window */
const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  // volume: stakes paid for attempts entered in the period
  const entered = await options.getLogs({ target: FATE_HOUSE, eventAbi: AttemptEnteredEvent });
  for (const attempt of entered) dailyVolume.addGasToken(attempt.stake);

  // house result of attempts settled in the period: + stake for a loss, stake - price for a win (the house pays the
  // listing price for the NFT); refunds return the stake and count 0
  const settled = (await options.getLogs({ target: FATE_HOUSE, eventAbi: AttemptSettledEvent }))
    .filter((log: any) => Number(log.status) === STATUS_WON || Number(log.status) === STATUS_LOST);
  if (settled.length) {
    const attempts = await options.toApi.multiCall({ target: FATE_HOUSE, abi: GET_ATTEMPT, calls: settled.map((log: any) => log.attemptId) });
    settled.forEach((log: any, i: number) => {
      const stake = BigInt(attempts[i].stake);
      const price = BigInt(attempts[i].price);
      dailyFees.addGasToken(Number(log.status) === STATUS_LOST ? stake : stake - price, LABEL);
    });
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailySupplySideRevenue: options.createBalances(),
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  // a won attempt pays out the whole listing price for a stake that can be a small part of it, so a period with few
  // attempts can end with the players ahead; the house result is then legitimately negative
  allowNegativeValue: true,
  fetch,
  chains: [CHAIN.ELYSIUM],
  start: FATE_START,
  methodology: {
    Volume: 'Stakes paid for Fate attempts entered in the period (AttemptEntered.stake), in native HYPE.',
    Fees: 'Gross gaming revenue: the stakes of lost attempts, less the listing price minus the stake of won attempts (the house buys the NFT for the winner), for attempts settled in the period. Refunded attempts count zero. Negative when players win more than they lose.',
    UserFees: 'Gross gaming revenue: what players lost to the house, net of what winning players received.',
    Revenue: 'All of the gross gaming revenue: it accrues to the Fate bankroll, which only depositors approved by Kalos can join; today every kFATE share is held by the Kalos founder wallet.',
    ProtocolRevenue: 'All of the gross gaming revenue, kept in the Kalos-controlled Fate bankroll. Bankroll deposits and redemptions are not counted.',
    SupplySideRevenue: 'Zero: there are no outside bankroll depositors.',
  },
  breakdownMethodology: {
    Fees: { [LABEL]: 'Stakes of lost Fate attempts minus (price - stake) of won attempts, settled in the period (AttemptSettled + getAttempt).' },
    UserFees: { [LABEL]: 'Stakes of lost Fate attempts minus (price - stake) of won attempts, settled in the period.' },
    Revenue: { [LABEL]: 'The house result of settled Fate attempts, kept in the Fate bankroll.' },
    ProtocolRevenue: { [LABEL]: 'The house result of settled Fate attempts, kept in the Fate bankroll.' },
  },
};

export default adapter;
