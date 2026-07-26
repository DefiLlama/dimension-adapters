import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

/**
 * WindfallLotto core contract on Polygon.
 *
 * Role:
 * - Receives DAI ticket payments.
 * - Emits one TicketBought event for every paid ticket.
 * - Accumulates the 10% host fee for each draw.
 * - Transfers accumulated fees to WindfallFeeShare after draw finalization.
 *
 * Deployment/start source:
 * - Current Polygon production deployment.
 * - Start boundary: 2026-04-05, corresponding to the current deployment's
 *   first production activity.
 *
 * Contract source:
 * https://github.com/windfall-lotto/windfall-lotto.eth/blob/main/contracts/WindfallLotto.sol
 */
const WINDFALL_LOTTO =
  "0x9650D206c6e0093FBc1D623b2A1e03984D24d3f1";

/**
 * WindfallFeeShare distribution contract on Polygon.
 *
 * Role:
 * - Receives accumulated draw fees from WindfallLotto.
 * - Allocates host shares to hostTreasury.
 * - Allocates one share to each active donor shareholder.
 * - Assigns integer-division remainders to hostTreasury.
 *
 * Deployment/start source:
 * - Current Polygon production deployment used by WINDFALL_LOTTO.
 *
 * Contract source:
 * https://github.com/windfall-lotto/windfall-lotto.eth/blob/main/contracts/WindfallFeeShare.sol
 */
const WINDFALL_FEE_SHARE =
  "0x8d1e76657F469932Dd04d0Bad2f0FCE0bbDb22a5";

/**
 * Polygon PoS DAI used for ticket payments, jackpot accounting,
 * protocol fees and prize payouts.
 */
const POLYGON_DAI =
  "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063";

/**
 * First production date for the current WindfallLotto deployment.
 *
 * Source: first production activity for WINDFALL_LOTTO on Polygon.
 */
const START_DATE = "2026-04-05";

/**
 * Constants reproduced from the deployed WindfallLotto contract:
 *
 * TICKET_PRICE = 1e18 DAI units
 * HOST_FEE_BPS = 1000
 * BPS = 10000
 *
 * Fee per ticket:
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
 * hostTreasury is separate from this limit.
 */
const MAX_DONOR_SHAREHOLDERS = 200n;

/**
 * Breakdown labels.
 *
 * These labels must match the corresponding breakdownMethodology keys.
 */
const METRIC = {
  TICKET_PURCHASE_FEES: "Ticket Purchase Fees",
  HOST_TREASURY_SHARE: "Host Treasury Share",
  DONOR_SHAREHOLDER_PAYOUTS: "Donor Shareholder Payouts",
} as const;

/**
 * WindfallLotto emits one TicketBought event for each paid ticket.
 *
 * buyTickets emits this event once per ticket in its loop and also emits a
 * TicketsBought batch summary. Only TicketBought is counted to avoid
 * double-counting batch purchases.
 */
const TICKET_BOUGHT_EVENT =
  "event TicketBought(uint32 indexed drawId, uint256 indexed ticketId, address indexed buyer, uint8[5] numbers)";

/**
 * Emitted by WindfallFeeShare when accumulated draw fees are distributed.
 */
const FEE_DISTRIBUTED_EVENT =
  "event FeeDistributed(uint256 amount, uint256 activeShares, uint256 sharePerMember, uint256 remainderToHost)";

type ShareSplit = {
  activeDonors: bigint;
  hostShares: bigint;
};

/**
 * Reconstructs the donor/host share split from activeShares.
 *
 * The deployed WindfallFeeShare contract calculates:
 *
 *   hostShares = max(1, ceil(activeDonors / 20))
 *   activeShares = activeDonors + hostShares
 *
 * Because FeeDistributed does not emit activeDonors and hostShares
 * separately, every permitted activeDonors value is evaluated.
 *
 * Exactly one candidate must satisfy the deployed contract formula.
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
          `{activeDonors=${activeDonors},hostShares=${hostShares}}`,
      )
      .join(",");

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
  const dailySupplySideRevenue = options.createBalances();

  /*
   * FEES
   *
   * Fees are recognized when tickets are purchased.
   *
   * Each TicketBought event corresponds to one paid 1 DAI ticket and
   * therefore represents 0.1 DAI in fees.
   */
  const ticketLogs = await options.getLogs({
    target: WINDFALL_LOTTO,
    eventAbi: TICKET_BOUGHT_EVENT,
  });

  const ticketCount = BigInt(ticketLogs.length);
  const generatedFees = ticketCount * FEE_PER_TICKET;

  if (generatedFees > 0n) {
    dailyFees.add(
      POLYGON_DAI,
      generatedFees,
      METRIC.TICKET_PURCHASE_FEES,
    );
  }

  /*
   * INCOME ALLOCATION
   *
   * FeeDistributed is emitted when accumulated draw fees are allocated.
   *
   * DeFiLlama classification:
   *
   * - hostTreasury allocation:
   *     dailyRevenue
   *     dailyProtocolRevenue
   *
   * - donor shareholder allocation:
   *     dailySupplySideRevenue
   *
   * Donor shareholders provide capital/participation to the FeeShare system.
   * Their payouts are therefore treated as supply-side costs rather than
   * protocol or token-holder revenue.
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
        `Windfall Lotto FeeDistributed has invalid amount=${amount}`,
      );
    }

    if (activeShares <= 0n) {
      throw new Error(
        `Windfall Lotto FeeDistributed has invalid activeShares=${activeShares}`,
      );
    }

    const { activeDonors, hostShares } =
      deriveShareSplit(activeShares);

    /*
     * Validate the aggregate event fields.
     *
     * This validates only the total distribution amount. The host/donor
     * split is validated independently by deriveShareSplit().
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
     * hostTreasury receives:
     *
     *   sharePerMember × hostShares + remainderToHost
     *
     * Active donor shareholders receive:
     *
     *   sharePerMember × activeDonors
     */
    const hostTreasuryRevenue =
      sharePerMember * hostShares + remainderToHost;

    const donorShareholderPayouts =
      sharePerMember * activeDonors;

    /*
     * Confirm that the categories account for the complete distribution.
     *
     * The validity of hostShares itself does not rely on this check;
     * hostShares was independently derived by deriveShareSplit().
     */
    if (
      hostTreasuryRevenue + donorShareholderPayouts !==
      amount
    ) {
      throw new Error(
        [
          "Windfall Lotto distribution category mismatch.",
          `amount=${amount}`,
          `hostTreasuryRevenue=${hostTreasuryRevenue}`,
          `donorShareholderPayouts=${donorShareholderPayouts}`,
          `activeDonors=${activeDonors}`,
          `hostShares=${hostShares}`,
        ].join(" "),
      );
    }

    /*
     * Revenue is only the hostTreasury share.
     */
    if (hostTreasuryRevenue > 0n) {
      dailyRevenue.add(
        POLYGON_DAI,
        hostTreasuryRevenue,
        METRIC.HOST_TREASURY_SHARE,
      );

      dailyProtocolRevenue.add(
        POLYGON_DAI,
        hostTreasuryRevenue,
        METRIC.HOST_TREASURY_SHARE,
      );
    }

    /*
     * Donor shareholder payouts are supply-side revenue/costs.
     */
    if (donorShareholderPayouts > 0n) {
      dailySupplySideRevenue.add(
        POLYGON_DAI,
        donorShareholderPayouts,
        METRIC.DONOR_SHAREHOLDER_PAYOUTS,
      );
    }
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees:
    "The 10% fee generated when users purchase Windfall Lotto tickets. Each TicketBought event represents one paid 1 DAI ticket and therefore 0.1 DAI in fees. Fees are recognized on the ticket-purchase date.",

  UserFees:
    "The 10% portion of every 1 DAI ticket purchase charged to the user.",

  Revenue:
    "The portion of distributed ticket fees allocated to hostTreasury. Donor shareholder payouts are excluded from protocol revenue and classified as supply-side revenue.",

  ProtocolRevenue:
    "The hostTreasury allocation, including all host shares and the integer-division remainder assigned to the host.",

  SupplySideRevenue:
    "The portion of distributed fees paid to active donor shareholders. Each active donor receives one FeeShare distribution share.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TICKET_PURCHASE_FEES]:
      "The 10% fee generated from paid Windfall Lotto ticket purchases.",
  },

  UserFees: {
    [METRIC.TICKET_PURCHASE_FEES]:
      "The 10% portion of each 1 DAI ticket price paid by users.",
  },

  Revenue: {
    [METRIC.HOST_TREASURY_SHARE]:
      "The FeeShare distribution allocated to hostTreasury, including host shares and the integer-division remainder.",
  },

  ProtocolRevenue: {
    [METRIC.HOST_TREASURY_SHARE]:
      "The portion retained by hostTreasury as protocol revenue.",
  },

  SupplySideRevenue: {
    [METRIC.DONOR_SHAREHOLDER_PAYOUTS]:
      "The portion of FeeShare distributions paid to active donor shareholders.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,

  fetch,
  chains: [CHAIN.POLYGON],
  start: START_DATE,

  methodology,
  breakdownMethodology,
};

export default adapter;
