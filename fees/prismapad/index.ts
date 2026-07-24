import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// Prismapad launchpad on Stable (chain id 988). Verified source:
// https://stablescan.xyz/address/0xdcb881fc8b472eb7797687b237e6cb123c425ff7#code
const LAUNCHPAD = "0xdcb881fc8b472eb7797687b237e6cb123c425ff7";

// Every token trades on the launchpad's internal bonding curve in native
// USDT0 (the chain's gas token). A flat 1% fee is taken per trade and split
// 50/50 between the token's creator and the protocol treasury, both
// hard-coded in the verified contract (FEE_BPS = 100, CREATOR_SHARE_BPS = 5000).
const BPS = 10_000n;
const CREATOR_SHARE_BPS = 5_000n;

const TRADE =
  "event Trade(address indexed token, address indexed trader, bool isBuy, uint256 usdtAmount, uint256 tokenAmount, uint256 fee, uint256 reserveUsdt, uint256 reserveToken)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const logs = await options.getLogs({ target: LAUNCHPAD, eventAbi: TRADE });

  for (const log of logs) {
    const fee = BigInt(log.fee);
    const creatorShare = (fee * CREATOR_SHARE_BPS) / BPS;
    const protocolShare = fee - creatorShare;

    // usdtAmount is the gross USDT0 leg of the trade (paid in on buys,
    // taken out of the curve on sells).
    dailyVolume.addGasToken(log.usdtAmount);
    dailyFees.addGasToken(fee, METRIC.SWAP_FEES);
    dailyRevenue.addGasToken(protocolShare, "Trade fees to protocol");
    dailySupplySideRevenue.addGasToken(creatorShare, "Trade fees to token creators");
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "A flat 1% fee charged on every bonding-curve trade, in native USDT0.",
  UserFees: "Traders pay the 1% trade fee; there is no token-creation fee.",
  Revenue: "50% of every trade fee accrues to the Prismapad treasury.",
  ProtocolRevenue: "50% of every trade fee accrues to the Prismapad treasury.",
  SupplySideRevenue: "50% of every trade fee accrues to the launched token's creator, claimable any time.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "1% fee on every bonding-curve buy and sell.",
  },
  Revenue: {
    "Trade fees to protocol": "The protocol's 50% share of the 1% trade fee.",
  },
  ProtocolRevenue: {
    "Trade fees to protocol": "The protocol's 50% share of the 1% trade fee.",
  },
  SupplySideRevenue: {
    "Trade fees to token creators": "The token creator's 50% share of the 1% trade fee.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.STABLE],
  start: "2026-07-23",
  fetch,
  methodology,
  breakdownMethodology,
};

export default adapter;
