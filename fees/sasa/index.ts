import ADDRESSES from "../../helpers/coreAssets.json";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// sasa (https://sasapad.fun): a meme coin launchpad where one coin launches on several chains at
// once (Base, BNB Chain, Robinhood Chain, Arc) and races for five minutes; the chain that raises
// the most keeps trading and the others' money is moved to it.
//
// Every coin trades in a pool sasa's builder contract creates and owns the liquidity of:
//   Base, Robinhood Chain  Uniswap V4, coin / native ETH
//   BNB Chain              PancakeSwap Infinity CL, coin / native BNB
//   Arc                    Uniswap V4, coin / USDC
// So all the pools' swap fees belong to the builder. Its keeper collects them regularly (about
// every 30 minutes for coins that traded) and each collection emits
//   FeesCollected(coin, quoteFees, coinFees)
// on the builder; the builder then sends 70% to sasa's fee vault and 30% to the coin's side (its
// creator, or buy-and-burn when the creator chose buybacks). The same 70/30 split applies to the
// coin-side fees (paid in the launched coin on sells); they are added under the coin's own
// address and count only where the coin has a price.
//
// Two builder generations run side by side (v7 and v8); both are counted.
// Deployments: https://github.com/neuronaicoin/neuron-fun/tree/main/contracts-v7/deployments

const FEES_COLLECTED = "event FeesCollected(address indexed coin, uint256 quoteFees, uint256 coinFees)";

const BPS = 10_000n;
const CREATOR_SIDE_BPS = 3_000n; // CREATOR_SIDE_BPS in RaceBuilder*.sol: 30% of pool fees to the coin side

// v7 builder (same address on every chain) and the v8 builder of each chain.
const V7_BUILDER = "0x05aFA6adFcd1c40CF82174025ecBC2E1ED603Ca4";
const CONFIG: Record<string, { builders: string[]; quote?: string }> = {
  [CHAIN.BASE]: { builders: [V7_BUILDER, "0x66823dDb7Aee371b59369F242607A9Ce034F0dd6"] },
  [CHAIN.BSC]: { builders: [V7_BUILDER, "0x68e8a49487421F2B1A976254feb205197C7bCBBF"] },
  [CHAIN.ROBINHOOD]: { builders: [V7_BUILDER, "0xe2A453EF4b142CDF921DC93169681dF77Ec24a45"] },
  // Arc pools are paired with USDC (the ERC-20 side of Arc's native USDC, 6 decimals)
  [CHAIN.ARC]: { builders: [V7_BUILDER, "0x5B76474ffe524f04f3522d7121471311C743ae58"], quote: ADDRESSES.arc.USDC },
};

const fetch = async (options: FetchOptions) => {
  const { builders, quote } = CONFIG[options.chain];
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const logs = await options.getLogs({ targets: builders, eventAbi: FEES_COLLECTED });
  for (const log of logs) {
    // quote side (ETH / BNB / USDC) and coin side (the launched coin), both split 70 / 30
    const sides: [string | undefined, bigint][] = [
      [quote, BigInt(log.quoteFees)],
      [log.coin, BigInt(log.coinFees)],
    ];
    for (const [token, fee] of sides) {
      if (fee === 0n) continue;
      const toCoinSide = (fee * CREATOR_SIDE_BPS) / BPS;
      const toSasa = fee - toCoinSide;
      if (token) {
        dailyFees.add(token, fee, METRIC.SWAP_FEES);
        dailyRevenue.add(token, toSasa, "Swap Fees to sasa");
        dailySupplySideRevenue.add(token, toCoinSide, "Swap Fees to Creators and Buybacks");
      } else {
        dailyFees.addGasToken(fee, METRIC.SWAP_FEES);
        dailyRevenue.addGasToken(toSasa, "Swap Fees to sasa");
        dailySupplySideRevenue.addGasToken(toCoinSide, "Swap Fees to Creators and Buybacks");
      }
    }
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Swap fees of the pools sasa creates for every coin, counted when sasa's builder collects them: the quote-asset side (ETH, BNB or USDC) and the coin side (in the launched coin, valued where the coin has a price).",
  UserFees: "Traders pay the pool's swap fee on every buy and sell.",
  Revenue: "70% of the collected swap fees, sent to sasa's fee vault.",
  ProtocolRevenue: "70% of the collected swap fees, sent to sasa's fee vault.",
  SupplySideRevenue: "30% of the collected swap fees, sent to each coin's creator, or used to buy back and burn the coin when its creator chose buybacks.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Swap fees of sasa-created Uniswap V4 / PancakeSwap Infinity pools, both sides, as collected by the builder (FeesCollected).",
  },
  UserFees: {
    [METRIC.SWAP_FEES]: "Swap fees traders pay on every buy and sell in sasa-created pools.",
  },
  Revenue: {
    "Swap Fees to sasa": "70% of collected swap fees, sent to sasa's fee vault.",
  },
  ProtocolRevenue: {
    "Swap Fees to sasa": "70% of collected swap fees, sent to sasa's fee vault.",
  },
  SupplySideRevenue: {
    "Swap Fees to Creators and Buybacks": "30% of collected swap fees, sent to the coin's creator or used for its buy-and-burn.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: {
    [CHAIN.BASE]: { start: "2026-10-17" },
    [CHAIN.BSC]: { start: "2026-10-17" },
    [CHAIN.ROBINHOOD]: { start: "2026-10-17" },
    [CHAIN.ARC]: { start: "2026-10-17" },
  },
  methodology,
  breakdownMethodology,
  doublecounted: true, // the same swap fees are also attributed to Uniswap V4 / PancakeSwap
};

export default adapter;
