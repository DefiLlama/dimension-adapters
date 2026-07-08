import { CHAIN } from "../chains";

// Cherum V2 routers (deployed 2026-06-26; HyperEVM 2026-07-05).
// router  = CherumRouter (same-chain batch swaps)
// fanout  = CherumFanOutRouter (cross-chain fan-out source side)
// Note: the same address can play a different role on different chains
// (CREATE from the same deployer nonce), so always map by (chain, role).
export const CherumContracts: Record<string, { router: string; fanout: string; start: string }> = {
  [CHAIN.ETHEREUM]: {
    router: "0xc8e81fa8f5fac773b13866773005acb0a80fc5ca",
    fanout: "0x7ba303dc458da48a5bcccad16ab529533935b9d7",
    start: "2026-06-26",
  },
  [CHAIN.BASE]: {
    router: "0xe7be2634a4bffe751f08cb2043651e2e9a13ca60",
    fanout: "0x652f64bdb2f2cff37c2481636c7784c9f1f65e45",
    start: "2026-06-26",
  },
  [CHAIN.ARBITRUM]: {
    router: "0x833aaffba7ed2b1cbc32a49c1c40b5f76db1b5e1",
    fanout: "0x0902e9819119a9d1b51efb85842983b76cab3145",
    start: "2026-06-26",
  },
  [CHAIN.OPTIMISM]: {
    router: "0xe7be2634a4bffe751f08cb2043651e2e9a13ca60",
    fanout: "0xb0284630e35c7df89e6e18dcddb6e490fbe55560",
    start: "2026-06-26",
  },
  [CHAIN.POLYGON]: {
    router: "0xa0eca6a116b192d24df3d423e0839e44c1ee12fa",
    fanout: "0x925a2eda850f786fc40bef6afb42c2b36631d391",
    start: "2026-06-26",
  },
  [CHAIN.BSC]: {
    router: "0x2b3428784aece90865251d94dedeb3efcfff4c6c",
    fanout: "0x7d38a643f3592bc5532bba5d615f5b3d5bb97b7c",
    start: "2026-06-26",
  },
};

// Fees are always charged in the input token, skimmed up-front by the router.
// Both contracts emit the same two events (identical signatures/topic0):
//   FeeCollected           -> protocol fee kept by Cherum
//   IntegratorFeeCollected -> markup paid out to a third-party integrator
export const FeeCollectedEvent =
  "event FeeCollected(bytes32 indexed intentId, address token, address collector, uint256 amount)";
export const IntegratorFeeCollectedEvent =
  "event IntegratorFeeCollected(bytes32 indexed intentId, address token, address recipient, uint256 amount)";

// CherumRouter: one event per same-chain leg. amountIn is the leg's slice of
// the principal (input token, after fees); success=false legs are refunded
// to the user in the same tx and are not counted as volume.
export const BatchLegEvent =
  "event BatchLeg(bytes32 indexed intentId, uint256 indexed batchId, uint8 legIndex, address aggregator, address fromToken, address toToken, uint256 amountIn, uint256 amountOut, address recipient, bool success)";

// CherumFanOutRouter: one event per cross-chain batch. principal is the
// amount actually sent into bridges (input token, after fees).
export const BatchOpenedEvent =
  "event BatchOpened(bytes32 indexed intentId, address indexed account, address indexed tokenIn, uint256 principal, uint256 cherumFee, uint256 integratorFee, uint8 legsCount)";
