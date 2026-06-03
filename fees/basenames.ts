import { CHAIN } from "../helpers/chains";
import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { getSqlFromFile, queryDuneSql } from "../helpers/dune";

// Basenames — Coinbase's ENS-based domain name service on Base.
//
// The Basenames registrar controllers emit
//   event ETHPaymentProcessed(address indexed payee, uint256 price)
// exactly once per paid registration or renewal, via the internal
// `_validatePayment(uint256 price)` helper. The `price` field is the protocol-set
// ETH cost post-discount (NOT `msg.value`), so user overpayment refunds are
// excluded automatically. There is a single `paymentReceiver` address
// (configurable by owner) — no referrer / ENS / LP split, so 100% of `price` is
// retained by the protocol.
//
// Source: https://github.com/base/basenames/blob/main/src/L2/UpgradeableRegistrarController.sol
//
// Three controllers have served Basenames since launch (all emit the same
// `ETHPaymentProcessed` signature, so a single IN clause covers all of them):
//   v0  0xd3e6775ed9b7dc12b205c8e608dc3767b9e5efda  (2024-07-25 → 2024-08-15,    439 events)
//   v1  0x4cCb0BB02FCABA27e82a56646E81d8c5bC4119a5  (2024-08-21 → 2025-09-23, 831K events)
//   v2  0xa7d2607c6bd39ae9521e514026cbb078405ab322  (2025-09-09 → present,   2.9M+ events)
//
// Source rationale (Dune over raw getLogs):
// The current v2 controller is not yet decoded in Dune's `basenames_base` namespace
// (Dune covers only the legacy v1 controller, which went dark 2025-09-23). The
// event ABI is verified in the Base source repo above and is identical across all
// three controllers, so we decode `topic0` + `data` directly from `base.logs` using
// the same pattern as `helpers/queries/jupiter-lend.sql`. This avoids both the
// Dune-namespace decoder gap and the local-vs-production reliability variance of
// `options.getLogs` (Llama RPC fallback drops events silently for some windows).

const ETH_CG_ID = "ethereum";

const LABEL = {
  BasenameRegistrationRenewalFees:
    "Basename Registration/Renewal Fees",
  BasenameRegistrationRenewalFeesToProtocol:
    "Basename Registration/Renewal Fees To Protocol",
} as const;

interface DailyEthPaid {
  eth_paid: number;
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  const query = getSqlFromFile("helpers/queries/basenames.sql", {
    start: options.startTimestamp,
    end: options.endTimestamp,
  });
  const data: DailyEthPaid[] = await queryDuneSql(options, query);

  const ethPaid = Number(data[0]?.eth_paid || 0);
  if (ethPaid > 0) {
    dailyFees.addCGToken(ETH_CG_ID, ethPaid, LABEL.BasenameRegistrationRenewalFees);
    dailyRevenue.addCGToken(ETH_CG_ID, ethPaid, LABEL.BasenameRegistrationRenewalFeesToProtocol);
    dailyProtocolRevenue.addCGToken(ETH_CG_ID, ethPaid, LABEL.BasenameRegistrationRenewalFeesToProtocol);
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue };
};

const methodology = {
  Fees:
    "Total ETH paid by users to register or renew Basenames on Base. Sourced from " +
    "ETHPaymentProcessed(address indexed payee, uint256 price) events emitted by the " +
    "Basenames registrar controllers. The `price` field is the protocol-set ETH cost " +
    "post-discount (not msg.value), so user overpayment refunds are excluded " +
    "automatically. Includes both registrations and renewals — the controller emits " +
    "the same event for both flows.",
  Revenue:
    "100% of registration and renewal payments are retained by the protocol. The " +
    "controller forwards all collected ETH to a single `paymentReceiver` address " +
    "(configurable by the owner), with no referrer, ENS, or supply-side split.",
  ProtocolRevenue:
    "Same as Revenue — full retention by the protocol.",
};

const breakdownMethodology = {
  Fees: {
    [LABEL.BasenameRegistrationRenewalFees]:
      "Total ETH paid by users for Basename registrations and renewals across all controller versions.",
  },
  SupplySideRevenue: {},
  Revenue: {
    [LABEL.BasenameRegistrationRenewalFeesToProtocol]:
      "100% of registration and renewal payments retained by the protocol (single payment receiver, no split).",
  },
  HoldersRevenue: {},
  ProtocolRevenue: {
    [LABEL.BasenameRegistrationRenewalFeesToProtocol]:
      "100% of registration and renewal payments retained by the protocol (single payment receiver, no split).",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.BASE],
  start: "2024-07-25", // first ETHPaymentProcessed emission across all controllers
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
