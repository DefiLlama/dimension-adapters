import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

/**
 * WindfallLotto core contract on Polygon.
 *
 * Role:
 * - Receives DAI ticket payments.
 * - Accumulates the 10% ticket fee for each draw.
 * - Transfers the accumulated fee to WindfallFeeShare after finalization.
 *
 * Source:
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
 * Source:
 * https://github.com/windfall-lotto/windfall-lotto.eth/blob/main/contracts/WindfallFeeShare.sol
 */
const WINDFALL_FEE_SHARE =
  "0x8d1e76657F469932Dd04d0Bad2f0FCE0bbDb22a5";

/** Polygon PoS DAI used for tickets, jackpots, fees and prize payments. */
const POLYGON_DAI =
  "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063";

/**
 * Start boundary for the current production deployment.
 * Source: first production activity of the deployed WindfallLotto system.
 */
const START_DATE = "2026-04-05";

/** Maximum donor shareholder count defined by WindfallFeeShare. */
const MAX_DONOR_SHAREHOLDERS = 200n;

const METRIC = {
  DISTRIBUTED_TICKET_FEES: "Distributed Ticket Fees",
  HOST_TREASURY_SHARE: "Host Treasury Share",
  DONOR_SHAREHOLDER_PAYOUTS: "Donor Shareholder Payouts",
} as const;

const FEE_DISTRIBUTED_EVENT =
  "event FeeDistributed(uint256 amount, uint256 activeShares, uint256 sharePerMember, uint256 remainderToHost)";

type ShareSplit = {
  activeDonors: bigint;
  hostShares: bigint;
};

/**
 * Reconstructs the unique donor/host share split represented by activeShares.
 *
 * Deployed formula:
 *   hostShares = max(1, ceil(activeDonors / 20))
 *   activeShares = activeDonors + hostShares
 */
function deriveShareSplit(activeShares: bigint): ShareSplit {
  const candidates: ShareSplit[] = [];

  for (
    let activeDonors = 0n;
    activeDonors <= MAX_DONOR_SHAREHOLDERS;
    activeDonors++
  ) {
    const hostShares =
      activeDonors === 0n ? 1n : (activeDonors + 19n) / 20n;

    if (activeDonors + hostShares === activeShares) {
      candidates.push({ activeDonors, hostShares });
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

  /**
   * All income-statement metrics are recognized from FeeDistributed so that:
   * dailyFees = dailyRevenue + dailySupplySideRevenue in every fetch period.
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

    const { activeDonors, hostShares } = deriveShareSplit(activeShares);

    /**
     * Validate only the aggregate values emitted by FeeDistributed.
     * The host/donor split is validated separately by deriveShareSplit().
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

    /**
     * Decompose the already validated distribution using the uniquely
     * reconstructed host/donor share counts.
     */
    const hostTreasuryRevenue =
      sharePerMember * hostShares + remainderToHost;

    const donorShareholderPayouts = sharePerMember * activeDonors;

    dailyFees.add(
      POLYGON_DAI,
      amount,
      METRIC.DISTRIBUTED_TICKET_FEES,
    );

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
    "Gross accumulated ticket fees recognized when WindfallFeeShare emits FeeDistributed. Recognition is aligned with the allocation period so gross fees equal protocol revenue plus supply-side revenue in every reporting window.",
  UserFees:
    "The accumulated 10% fees originally generated by paid Windfall Lotto ticket purchases and recognized when they are distributed.",
  Revenue:
    "The portion of each FeeDistributed amount allocated to hostTreasury. Donor shareholder payouts are excluded and classified as supply-side revenue.",
  ProtocolRevenue:
    "The hostTreasury allocation, including all host shares and the integer-division remainder assigned exclusively to the host.",
  SupplySideRevenue:
    "The portion of each FeeDistributed amount allocated to active donor shareholders. Each active donor receives one distribution share.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.DISTRIBUTED_TICKET_FEES]:
      "The complete accumulated ticket-fee amount allocated by a FeeDistributed event.",
  },
  UserFees: {
    [METRIC.DISTRIBUTED_TICKET_FEES]:
      "Accumulated 10% ticket-purchase fees recognized at distribution.",
  },
  Revenue: {
    [METRIC.HOST_TREASURY_SHARE]:
      "The portion of distributed ticket fees allocated to hostTreasury, including host shares and the integer-division remainder.",
  },
  ProtocolRevenue: {
    [METRIC.HOST_TREASURY_SHARE]:
      "The distributed fee amount retained by hostTreasury as protocol revenue.",
  },
  SupplySideRevenue: {
    [METRIC.DONOR_SHAREHOLDER_PAYOUTS]:
      "The distributed fee amount paid to active donor shareholders.",
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
