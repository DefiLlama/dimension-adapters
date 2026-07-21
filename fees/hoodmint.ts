// HoodMint — fees, revenue & volume adapter.
//
// HoodMint (https://hoodmint.fun) is a memecoin launchpad on Robinhood Chain
// (chainId 4663). Every launch and trade goes through a single singleton
// bonding-curve contract, HoodMintCurve:
//   https://robinhoodchain.blockscout.com/address/0x570e51c509a20C63C409A43Bc8d9e2aeA564B61b
//
// Fee source (the only fee HoodMint charges — there is no launch/creation fee
// and no graduation fee): a 1.25% fee on the ETH leg of every bonding-curve
// buy and sell, split creator-first: 0.88% to the token's creator and 0.37%
// to the protocol (CREATOR_FEE_BPS = 88, PROTOCOL_FEE_BPS = 37). The exact
// per-trade split is emitted in wei on each Trade event (protocolFee /
// creatorFee fields), so this adapter stays correct if a future deployment
// changes the split.
//
// dailyFees              = sum(protocolFee + creatorFee)
// dailyRevenue           = sum(protocolFee)   (== dailyProtocolRevenue)
// dailySupplySideRevenue = sum(creatorFee)    (creator earnings, like pump.fun)
// dailyVolume            = sum(ethGross): ETH paid in on buys (fee-inclusive)
//                          and gross ETH taken out of the reserve on sells.
//
// On graduation the raised ETH moves into a permanently locked Uniswap V3
// position; post-graduation swaps are ordinary Uniswap trades and are not
// counted here.
//
// -----------------------------------------------------------------------------------------------------
import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const HOODMINT_CURVE = "0x570e51c509a20C63C409A43Bc8d9e2aeA564B61b";

const TRADE =
  "event Trade(address indexed token, address indexed trader, bool isBuy, uint256 ethGross, uint256 ethNet, uint256 tokenAmount, uint256 protocolFee, uint256 creatorFee, uint128 virtualEth, uint128 virtualToken, uint128 realEth, uint128 realToken, bool complete)";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyVolume = options.createBalances();

  const tradeLogs = await options.getLogs({ target: HOODMINT_CURVE, eventAbi: TRADE });

  for (const log of tradeLogs) {
    dailyFees.addGasToken(log.protocolFee + log.creatorFee, METRIC.TRADING_FEES);
    dailyRevenue.addGasToken(log.protocolFee, "Trading Fees To Protocol");
    dailySupplySideRevenue.addGasToken(log.creatorFee, "Trading Fees To Creators");
    dailyVolume.addGasToken(log.ethGross);
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue, dailyVolume };
};

const methodology = {
  Volume: "ETH side of every bonding-curve trade: ETH paid in on buys (fee-inclusive) and gross ETH taken out of the curve reserve on sells. Post-graduation Uniswap V3 swaps are not counted.",
  Fees: "A 1.25% fee charged on the ETH leg of every bonding-curve buy and sell, read per trade from the Trade event's protocolFee and creatorFee fields. HoodMint has no launch fee and no graduation fee.",
  Revenue: "The protocol slice of the bonding-curve trade fee.",
  ProtocolRevenue: "Same as Revenue — the protocol slice of the bonding-curve trade fee.",
  SupplySideRevenue: "The creator slice of the bonding-curve trade fee, claimable by each token's creator.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "1.25% bonding-curve trade fee on the ETH leg of every buy and sell (protocolFee + creatorFee from the Trade event).",
  },
  Revenue: {
    "Trading Fees To Protocol": "Protocol slice of the bonding-curve trade fee (protocolFee field of the Trade event).",
  },
  ProtocolRevenue: {
    "Trading Fees To Protocol": "Protocol slice of the bonding-curve trade fee (protocolFee field of the Trade event).",
  },
  SupplySideRevenue: {
    "Trading Fees To Creators": "Creator slice of the bonding-curve trade fee (creatorFee field of the Trade event), claimable by the token's creator.",
  },
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  methodology,
  breakdownMethodology,
  chains: [CHAIN.ROBINHOOD],
  fetch,
  start: "2026-07-21", // HoodMintCurve deployment (block 15675879)
};

export default adapter;
