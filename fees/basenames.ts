import { CHAIN } from "../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { nullAddress } from "../helpers/token";

// Basenames: Coinbase's ENS-based domain name service on Base.
//
// Each paid registration or renewal emits
//   event ETHPaymentProcessed(address indexed payee, uint256 price)
// where `price` is the protocol-set ETH cost post-discount (not msg.value), so
// user overpayment refunds are excluded by the contract itself. The same event
// covers both registrations and renewals. Collected ETH accumulates on the
// controller and is later swept in full to a single paymentReceiver, so the
// event is the only per-day signal. There is no referrer / ENS / supply-side
// split, so 100% of `price` is protocol revenue.
//
// Source: https://github.com/base/basenames/blob/main/src/L2/UpgradeableRegistrarController.sol
//
// Controllers (all emit the same event signature):
//   0xd3e6775ed9b7dc12b205c8e608dc3767b9e5efda  (early controller)
//   0x4cCb0BB02FCABA27e82a56646E81d8c5bC4119a5  (legacy RegistrarController)
//   0xa7d2607c6bd39ae9521e514026cbb078405ab322  (current UpgradeableRegistrarController)

const CONTROLLERS = [
  "0xd3e6775ed9b7dc12b205c8e608dc3767b9e5efda",
  "0x4cCb0BB02FCABA27e82a56646E81d8c5bC4119a5",
  "0xa7d2607c6bd39ae9521e514026cbb078405ab322",
];

const REGISTRATION_RENEWAL = "Registration & Renewal";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const logs = await options.getLogs({
    targets: CONTROLLERS,
    eventAbi: "event ETHPaymentProcessed(address indexed payee, uint256 price)",
  });
  logs.forEach((log) => dailyFees.add(nullAddress, log.price, REGISTRATION_RENEWAL));

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "Total ETH paid by users to register or renew Basenames, taken from the `price` field of ETHPaymentProcessed events (post-discount cost, excluding overpayment refunds).",
  Revenue: "100% of registration and renewal payments are retained by the protocol. Collected ETH is swept in full to a single payment receiver, with no referrer or supply-side split.",
  ProtocolRevenue: "Same as Revenue, full retention by the protocol.",
};

const breakdownMethodology = {
  Fees: {
    [REGISTRATION_RENEWAL]: "ETH paid by users for Basename registrations and renewals across all controllers.",
  },
  Revenue: {
    [REGISTRATION_RENEWAL]: "100% of registration and renewal payments retained by the protocol.",
  },
  ProtocolRevenue: {
    [REGISTRATION_RENEWAL]: "100% of registration and renewal payments retained by the protocol.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.BASE],
  start: "2024-07-25", // first ETHPaymentProcessed emission
  methodology,
  breakdownMethodology,
  pullHourly: true,
};

export default adapter;
