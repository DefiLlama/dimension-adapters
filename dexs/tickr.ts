import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { nullAddress } from "../helpers/token";
import { FetchOptions, SimpleAdapter } from "../adapters/types";

// Tickr — Non-Fungible Ticker launchpad on Uniswap v4 (Ethereum mainnet).
//
// Each launched ERC-20 deploys its own ETH/Token v4 pool, seeds it with the
// entire 1B supply, and burns the LP NFT to 0xdEaD in the same tx. Trading
// routes through a single immutable hook that takes a flat 2% fee on the ETH
// side of every swap and splits it 50/50: 1% to the holder of the token's
// transferable Non-Fungible Ticker Owner NFT (creator), 1% to the protocol
// (factory).
//
// The hook emits FeeCollected on every fee-bearing swap with the gross fee
// pre-split into creator/platform shares — all denominated in native ETH
// (currency0 of every Tickr pool). That single event stream is enough to
// derive fees, supply-side and protocol revenue exactly.

const HOOK = "0x8Bd422134164F74023308A22BA991Ae0412900cC";

const FeeCollected =
  "event FeeCollected(address indexed token, uint256 totalFee, uint256 creatorShare, uint256 platformShare)";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const logs = await options.getLogs({
    target: HOOK,
    eventAbi: FeeCollected,
  });

  for (const log of logs) {
    dailyFees.add(nullAddress, log.totalFee.toString(), METRIC.TRADING_FEES);
    dailySupplySideRevenue.add(
      nullAddress,
      log.creatorShare.toString(),
      METRIC.CREATOR_FEES,
    );
    dailyRevenue.add(
      nullAddress,
      log.platformShare.toString(),
      METRIC.PROTOCOL_FEES,
    );
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailyHoldersRevenue: 0,
  };
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]:
      "2% flat fee charged by the Tickr hook on the ETH leg of every swap (FeeCollected.totalFee).",
  },
  SupplySideRevenue: {
    [METRIC.CREATOR_FEES]:
      "1% creator share routed to the Non-Fungible Ticker Owner NFT holder (FeeCollected.creatorShare).",
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]:
      "1% protocol share routed to the Tickr factory (FeeCollected.platformShare).",
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_FEES]:
      "1% protocol share routed to the Tickr factory (FeeCollected.platformShare).",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM],
  // Tickr factory deploy block on Ethereum mainnet.
  start: 24994342,
  methodology: {
    Fees: "2% flat fee charged by the Tickr hook on the ETH leg of every swap.",
    UserFees:
      "All fees are paid by traders on the input or output ETH side of each swap.",
    SupplySideRevenue:
      "1% creator share routed to the holder of the token's Non-Fungible Ticker Owner NFT.",
    Revenue: "1% protocol share routed to the Tickr factory.",
    ProtocolRevenue: "1% protocol share routed to the Tickr factory.",
    HoldersRevenue:
      "Tickr does not distribute fees to TICKR token holders; the protocol's cut accrues to the factory.",
  },
  breakdownMethodology,
};

export default adapter;
