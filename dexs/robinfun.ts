import { Adapter, FetchOptions, FetchResultV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// https://robinfun.live/whitepaper
const FACTORIES = [
  "0xd861cb5DC71A0171E8F0f6586cADb069f3A35E4d", // V5
  "0x42B1f2Fb09502b66Ae21769b3384a7788d020d73", // V4
  "0x9A4a94Bd3aF6acF5567A3B22f264E08B0962B8c8", // V3
  "0xD69A9fDee44a42c8E614128FEda486128cB27222", // V2
  "0xD952A74C85a2221a7DaB185c62cfD7EBa8C94AFC", // V1
];

const BUY_EVENT =
  "event Buy(address indexed token, address indexed buyer, uint256 ethIn, uint256 tokensOut, uint256 newRealEth, uint256 newPriceWeiPerToken)";
const SELL_EVENT =
  "event Sell(address indexed token, address indexed seller, uint256 tokensIn, uint256 ethOut, uint256 newRealEth, uint256 newPriceWeiPerToken)";
// Emitted by the factory on every bonding-curve trade with the full 1% fee, taken in ETH.
const FEE_COLLECTED_EVENT =
  "event FeeCollected(address indexed token, uint256 amount)";
// Emitted by each graduated token contract when its accrued post-graduation Uniswap fee
// 1% fee-on-transfer is auto-swapped to ETH and paid out 50/50 to creator and treasury.
const FEE_SWAPPED_EVENT =
  "event FeeSwapped(uint256 tokensSold, uint256 ethToCreator, uint256 ethToTreasury)";

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const [buyLogs, sellLogs, feeLogs, feeSwappedLogs] = await Promise.all([
    options.getLogs({ targets: FACTORIES, eventAbi: BUY_EVENT }),
    options.getLogs({ targets: FACTORIES, eventAbi: SELL_EVENT }),
    options.getLogs({ targets: FACTORIES, eventAbi: FEE_COLLECTED_EVENT }),
    options.getLogs({ noTarget: true, eventAbi: FEE_SWAPPED_EVENT }),
  ]);

  buyLogs.forEach((log) => dailyVolume.addGasToken(log.ethIn));
  sellLogs.forEach((log) => dailyVolume.addGasToken(log.ethOut));

  // Bonding-curve fee: full 1% taken in ETH, split evenly creator / treasury.
  feeLogs.forEach((log) => {
    dailyFees.addGasToken(log.amount, "Bonding Curve Fees");
    dailyRevenue.addGasToken(log.amount / 2n, "Bonding Curve Fees");
    dailySupplySideRevenue.addGasToken(log.amount / 2n, "Bonding Curve Fees");
  });

  // Post-graduation Uniswap fee: already split 50/50 into creator / treasury ETH.
  feeSwappedLogs.forEach((log) => {
    dailyFees.addGasToken(BigInt(log.ethToCreator) + BigInt(log.ethToTreasury), "Post-Graduation DEX Fees");
    dailyRevenue.addGasToken(log.ethToTreasury, "Post-Graduation DEX Fees");
    dailySupplySideRevenue.addGasToken(log.ethToCreator, "Post-Graduation DEX Fees");
  });

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ROBINHOOD]: {
      fetch,
      start: "2026-07-02",
    },
  },
  methodology: {
    Volume:
      "Sum of ETH spent on buys and received from sells across RobinFun bonding curve trades on Robinhood Chain.",
    Fees: "1% trade fee, taken in ETH. On the bonding curve the factory collects it directly (FeeCollected); after graduation each token accrues a 1% Uniswap fee that is auto-swapped to ETH (FeeSwapped).",
    Revenue: "Half of the 1% trade fee (0.5%) goes to the RobinFun protocol treasury, on both the bonding curve and the graduated Uniswap market.",
    ProtocolRevenue: "Half of the 1% trade fee (0.5%) goes to the RobinFun protocol treasury, on both the bonding curve and the graduated Uniswap market.",
    SupplySideRevenue: "Half of the 1% trade fee (0.5%) goes to the token creator, on both the bonding curve and the graduated Uniswap market.",
  },
  breakdownMethodology: {
    Fees: {
      "Bonding Curve Fees": "1% fee taken in ETH by the factory on bonding-curve buys and sells (FeeCollected).",
      "Post-Graduation DEX Fees": "1% post-graduation Uniswap fee accrued in each token and auto-swapped to ETH (FeeSwapped).",
    },
    Revenue: {
      "Bonding Curve Fees": "0.5% protocol treasury share of the bonding-curve fee.",
      "Post-Graduation DEX Fees": "0.5% protocol treasury share of the post-graduation DEX fee.",
    },
    ProtocolRevenue: {
      "Bonding Curve Fees": "0.5% protocol treasury share of the bonding-curve fee.",
      "Post-Graduation DEX Fees": "0.5% protocol treasury share of the post-graduation DEX fee.",
    },
    SupplySideRevenue: {
      "Bonding Curve Fees": "0.5% creator share of the bonding-curve fee.",
      "Post-Graduation DEX Fees": "0.5% creator share of the post-graduation DEX fee.",
    },
  },
};

export default adapter;
