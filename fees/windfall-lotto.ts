import {
  FetchOptions,
  FetchResultFees,
  SimpleAdapter,
} from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// WindfallLotto core contract on Polygon.
// Receives DAI ticket payments and emits one TicketBought event per paid ticket.
// Source: verified Windfall Lotto deployment.
const WINDFALL_LOTTO =
  "0x9650D206c6e0093FBc1D623b2A1e03984D24d3f1";

// WindfallFeeShare contract on Polygon.
// Receives accumulated draw fees and allocates them between hostTreasury
// and active donor shareholders.
// Source: verified Windfall Lotto deployment.
const WINDFALL_FEE_SHARE =
  "0x8d1e76657F469932Dd04d0Bad2f0FCE0bbDb22a5";

// Legacy Polygon PoS DAI used by Windfall Lotto for ticket purchases,
// jackpot accounting, fee distribution and prize payments.
const POLYGON_DAI =
  "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063";

// The deployed contract fixes the ticket price at 1 DAI.
const TICKET_PRICE = 1_000_000_000_000_000_000n;

// HOST_FEE_BPS = 1000 out of BPS = 10000 in WindfallLotto.
// This equals a 10% fee, or 0.1 DAI per paid ticket.
const HOST_FEE_BPS = 1_000n;
const BPS = 10_000n;
const FEE_PER_TICKET = (TICKET_PRICE * HOST_FEE_BPS) / BPS;

// First production date for the currently deployed WindfallLotto contract.
// Source: Polygon deployment/start boundary used by the protocol adapter.
// 0xd2128af64ae213f66a85314adf3d9ac9dcba0fa7214c40b137a6a39894b43e19
const START_DATE = "2026-04-05";

const TICKET_BOUGHT_EVENT =
  "event TicketBought(uint32 indexed drawId, uint256 indexed ticketId, address indexed buyer, uint8[5] numbers)";

const FEE_DISTRIBUTED_EVENT =
  "event FeeDistributed(uint256 amount, uint256 activeShares, uint256 sharePerMember, uint256 remainderToHost)";

/**
 * Derives the number of host shares from the total number of active shares.
 *
 * WindfallFeeShare calculates:
 *
 *   hostShares = max(1, ceil(activeDonors / 20))
 *   activeShares = activeDonors + hostShares
 *
 * activeDonors is capped at 200, so hostShares is between 1 and 10.
 */
function deriveHostShares(activeShares: bigint): bigint {
  for (let hostShares = 1n; hostShares <= 10n; hostShares++) {
    if (activeShares < hostShares) continue;

    const activeDonors = activeShares - hostShares;
    const expectedHostShares =
      activeDonors === 0n ? 1n : (activeDonors + 19n) / 20n;

    if (expectedHostShares === hostShares) {
      return hostShares;
    }
  }

  throw new Error(
    `Unable to derive Windfall Lotto host shares from activeShares=${activeShares}`,
  );
}

const fetch = async (
  options: FetchOptions,
): Promise<FetchResultFees> => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  /*
   * Fee recognition
   *
   * WindfallLotto emits exactly one TicketBought event per paid ticket.
   * buyTickets also emits TicketBought once inside its loop for every
   * ticket minted, so the summary TicketsBought event must not be counted.
   *
   * Every paid ticket costs 1 DAI and creates a 10% fee.
   */
  const ticketLogs = await options.getLogs({
    target: WINDFALL_LOTTO,
    eventAbi: TICKET_BOUGHT_EVENT,
  });

  const ticketFees = BigInt(ticketLogs.length) * FEE_PER_TICKET;

  if (ticketFees > 0n) {
    dailyFees.add(POLYGON_DAI, ticketFees);
  }

  /*
   * Revenue recognition
   *
   * Accumulated ticket fees are transferred to WindfallFeeShare only
   * after the draw reaches COUNTING_DONE and distributeHostFee or
   * openNextDraw triggers the distribution.
   *
   * FeeDistributed reports:
   * - total distributed amount
   * - total active shares, including host shares
   * - amount allocated per share
   * - division remainder allocated entirely to hostTreasury
   */
  const distributionLogs = await options.getLogs({
    target: WINDFALL_FEE_SHARE,
    eventAbi: FEE_DISTRIBUTED_EVENT,
  });

  for (const log of distributionLogs) {
    const amount = BigInt(log.amount);
    const activeShares = BigInt(log.activeShares);
    const sharePerMember = BigInt(log.sharePerMember);
    const remainderToHost = BigInt(log.remainderToHost);

    if (activeShares === 0n) {
      throw new Error(
        "Windfall Lotto FeeDistributed event has zero activeShares",
      );
    }

    const hostShares = deriveHostShares(activeShares);
    const donorShares = activeShares - hostShares;

    const protocolRevenue =
      sharePerMember * hostShares + remainderToHost;

    const holdersRevenue = sharePerMember * donorShares;

    /*
     * This integrity check reproduces the exact Solidity allocation:
     *
     * amount =
     *   sharePerMember × activeShares
     *   + remainderToHost
     */
    if (protocolRevenue + holdersRevenue !== amount) {
      throw new Error(
        [
          "Windfall Lotto fee distribution mismatch:",
          `amount=${amount}`,
          `protocolRevenue=${protocolRevenue}`,
          `holdersRevenue=${holdersRevenue}`,
          `activeShares=${activeShares}`,
          `hostShares=${hostShares}`,
        ].join(" "),
      );
    }

    dailyRevenue.add(POLYGON_DAI, amount);
    dailyProtocolRevenue.add(POLYGON_DAI, protocolRevenue);

    if (holdersRevenue > 0n) {
      dailyHoldersRevenue.add(POLYGON_DAI, holdersRevenue);
    }
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,

  fetch,
  chains: [CHAIN.POLYGON],
  start: START_DATE,

  methodology: {
    Fees:
      "The 10% fee generated when users purchase Windfall Lotto tickets. Each TicketBought event represents one paid 1 DAI ticket and therefore 0.1 DAI in fees. Fees are recognized on the ticket-purchase date.",

    UserFees:
      "The 10% portion of each 1 DAI ticket purchase charged to users as the Windfall Lotto host fee.",

    Revenue:
      "Accumulated ticket fees distributed through WindfallFeeShare. Revenue is recognized when FeeDistributed is emitted after a draw reaches COUNTING_DONE.",

    ProtocolRevenue:
      "The portion allocated to hostTreasury. The adapter derives the host share count using the contract formula max(1, ceil(activeDonors / 20)) and includes the integer-division remainder assigned to the host.",

    HoldersRevenue:
      "The portion allocated to active donor shareholders, excluding all hostTreasury shares and the remainder assigned to the host.",
  },
};

export default adapter;
