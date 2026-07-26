import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

/**
 * Windfall Lotto core contract on Polygon.
 *
 * Role:
 * - Receives DAI ticket payments.
 * - Accumulates the 10% ticket fee inside each draw.
 * - Emits one TicketBought event for every paid ticket.
 * - Transfers the accumulated fee to WindfallFeeShare after draw finalization.
 *
 * Source:
 * https://github.com/windfall-lotto/windfall-lotto.eth/blob/main/contracts/WindfallLotto.sol
 */
const WINDFALL_LOTTO =
  "0x9650D206c6e0093FBc1D623b2A1e03984D24d3f1";

/**
 * Windfall FeeShare contract on Polygon.
 *
 * Role:
 * - Receives accumulated ticket fees from WindfallLotto.
 * - Allocates revenue between hostTreasury and active donor shareholders.
 * - Emits FeeDistributed with the distribution parameters.
 *
 * Source:
 * https://github.com/windfall-lotto/windfall-lotto.eth/blob/main/contracts/WindfallFeeShare.sol
 */
const WINDFALL_FEE_SHARE =
  "0x8d1e76657F469932Dd04d0Bad2f0FCE0bbDb22a5";

/**
 * Polygon PoS DAI used for tickets, jackpot funds, fees and payouts.
 */
const POLYGON_DAI =
  "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063";

/**
 * Current deployment start boundary.
 *
 * This should be the UTC date of the first production TicketBought event
 * emitted by the currently deployed WindfallLotto contract.
 *
 * Source: Polygon on-chain production activity for WINDFALL_LOTTO.
 */
const START_DATE = "2026-04-05";

/**
 * Contract constants reproduced from WindfallLotto:
 *
 * TICKET_PRICE = 1e18
 * HOST_FEE_BPS = 1000
 * BPS = 10000
 *
 * Therefore, each paid ticket generates:
 *
 * 1 DAI × 10% = 0.1 DAI
 */
const TICKET_PRICE = 1_000_000_000_000_000_000n;
const HOST_FEE_BPS = 1_000n;
const BPS = 10_000n;

const FEE_PER_TICKET =
  (TICKET_PRICE * HOST_FEE_BPS) / BPS;

/**
 * Maximum number of donor shareholders permitted by WindfallFeeShare.
 *
 * The host is excluded from this limit.
 */
const MAX_DONOR_SHAREHOLDERS = 200n;

/**
 * WindfallLotto emits exactly one TicketBought event for each paid ticket.
 *
 * buyTicket emits it once.
 * buyTickets emits it once per ticket inside its loop and then emits a separate
 * TicketsBought batch summary. The batch summary must not be counted because
 * doing so would double-count batch purchases.
 */
const TICKET_BOUGHT_EVENT =
  "event TicketBought(uint32 indexed drawId, uint256 indexed ticketId, address indexed buyer, uint8[5] numbers)";

/**
 * Emitted by WindfallFeeShare after an accumulated draw fee is allocated.
 */
const FEE_DISTRIBUTED_EVENT =
  "event FeeDistributed(uint256 amount, uint256 activeShares, uint256 sharePerMember, uint256 remainderToHost)";

type ShareSplit = {
  activeDonors: bigint;
  hostShares: bigint;
};

/**
 * Reconstructs and validates the donor/host share split represented by a
 * FeeDistributed.activeShares value.
 *
 * The deployed contract calculates:
 *
 *   hostShares = max(1, ceil(activeDonors / 20))
 *   activeShares = activeDonors + hostShares
 *
 * The FeeDistributed event does not emit activeDonors or hostShares separately.
 * To avoid assuming an arbitrary split, this function enumerates every donor
 * count allowed by the deployed contract and requires exactly one valid result.
 *
 * This validates the split itself. It is independent from the later aggregate
 * check of the FeeDistributed amount.
 */
function deriveShareSplit(activeShares: bigint): ShareSplit {
  const candidates: ShareSplit[] = [];

  for (
    let activeDonors = 0n;
    activeDonors <= MAX_DONOR_SHAREHOLDERS;
    activeDonors++
  ) {
    const hostShares =
      activeDonors === 0n
        ? 1n
        : (activeDonors + 19n) / 20n;

    if (activeDonors + hostShares === activeShares) {
      candidates.push({
        activeDonors,
        hostShares,
      });
    }
  }

  if (candidates.length !== 1) {
    const candidateDescription = candidates
      .map(
        ({ activeDonors, hostShares }) =>
          `{ activeDonors: ${activeDonors}, hostShares: ${hostShares} }`,
      )
      .join(", ");

    throw new Error(
      [
        "Unable to uniquely derive Windfall Lotto share split.",
        `activeShares=${activeShares}`,
        `candidateCount=${candidates.length}`,
        `candidates=[${candidateDescription}]`,
      ].join(" "),
    );
  }

  return candidates[0];
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  /*
   * FEES
   *
   * Fees are recognized when users buy tickets.
   *
   * The main contract emits one TicketBought event per paid ticket. Since the
   * deployed ticket price and fee percentage are immutable constants, the fee
   * for the period is:
   *
   *   TicketBought count × 0.1 DAI
   */
  const ticketLogs = await options.getLogs({
    target: WINDFALL_LOTTO,
    eventAbi: TICKET_BOUGHT_EVENT,
  });

  const ticketCount = BigInt(ticketLogs.length);
  const ticketFees = ticketCount * FEE_PER_TICKET;

  if (ticketFees > 0n) {
    dailyFees.add(POLYGON_DAI, ticketFees);
  }

  /*
   * REVENUE
   *
   * WindfallLotto accumulates ticket fees inside each draw. The cumulative
   * amount is transferred to WindfallFeeShare only after the draw reaches
   * COUNTING_DONE and distribution is triggered.
   *
   * Revenue is therefore recognized from FeeDistributed events, separately
   * from the original daily fee-generation date.
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

    if (amount <= 0n) {
      throw new Error(
        `Windfall Lotto FeeDistributed contains a non-positive amount: ${amount}`,
      );
    }

    if (activeShares <= 0n) {
      throw new Error(
        `Windfall Lotto FeeDistributed contains invalid activeShares: ${activeShares}`,
      );
    }

    /*
     * Independently validate and reconstruct the host/donor split from the
     * deployed share formula.
     */
    const { activeDonors, hostShares } =
      deriveShareSplit(activeShares);

    /*
     * Validate only the aggregate event accounting:
     *
     *   distributed = sharePerMember × activeShares
     *   amount = distributed + remainderToHost
     *
     * This check does not validate the host/donor split. That validation is
     * performed separately by deriveShareSplit().
     */
    const reconstructedAmount =
      sharePerMember * activeShares + remainderToHost;

    if (reconstructedAmount !== amount) {
      throw new Error(
        [
          "Windfall Lotto FeeDistributed aggregate mismatch.",
          `amount=${amount}`,
          `reconstructedAmount=${reconstructedAmount}`,
          `activeShares=${activeShares}`,
          `sharePerMember=${sharePerMember}`,
          `remainderToHost=${remainderToHost}`,
        ].join(" "),
      );
    }

    /*
     * The deployed contract credits hostTreasury with:
     *
     *   sharePerMember × hostShares + remainderToHost
     *
     * Every active donor receives exactly one share.
     */
    const protocolRevenue =
      sharePerMember * hostShares + remainderToHost;

    const holdersRevenue =
      sharePerMember * activeDonors;

    /*
     * Category reconciliation.
     *
     * This is not used to validate hostShares. It confirms that the two
     * categories produced from the independently validated share split fully
     * account for the emitted distribution amount.
     */
    const categorizedRevenue =
      protocolRevenue + holdersRevenue;

    if (categorizedRevenue !== amount) {
      throw new Error(
        [
          "Windfall Lotto revenue category mismatch.",
          `amount=${amount}`,
          `categorizedRevenue=${categorizedRevenue}`,
          `protocolRevenue=${protocolRevenue}`,
          `holdersRevenue=${holdersRevenue}`,
          `activeDonors=${activeDonors}`,
          `hostShares=${hostShares}`,
        ].join(" "),
      );
    }

    dailyRevenue.add(POLYGON_DAI, amount);

    if (protocolRevenue > 0n) {
      dailyProtocolRevenue.add(
        POLYGON_DAI,
        protocolRevenue,
      );
    }

    if (holdersRevenue > 0n) {
      dailyHoldersRevenue.add(
        POLYGON_DAI,
        holdersRevenue,
      );
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
      "The 10% fee generated when users purchase Windfall Lotto tickets. The adapter counts individual TicketBought events, with each event representing one paid 1 DAI ticket and 0.1 DAI in fees. Fees are recognized on the ticket-purchase date.",

    UserFees:
      "The 10% portion of every 1 DAI ticket purchase charged to the user as the Windfall Lotto host fee.",

    Revenue:
      "Accumulated ticket fees distributed through WindfallFeeShare. Revenue is recognized when the FeeDistributed event is emitted after draw finalization.",

    ProtocolRevenue:
      "The portion of each FeeDistributed amount allocated to hostTreasury. It consists of the value of all host shares plus the integer-division remainder assigned exclusively to the host.",

    HoldersRevenue:
      "The portion of each FeeDistributed amount allocated to active donor shareholders. Each active donor receives one share, and hostTreasury shares and remainders are excluded.",
  },
};

export default adapter;
