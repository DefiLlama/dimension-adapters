import { FetchOptions, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const REP369 = "0x0EE7adC2BAb46BaD56B91D9641A8cDEd09f82369".toLowerCase();
const WPLS = "0xA1077a294dDE1B09bB078844df40758a5D0f9a27".toLowerCase();
const MAIN_PAIR = "0x240e7A47fE5F91806c6D6056Fe4f62622303E1A5".toLowerCase();

const swapEvent =
  "event Swap(address indexed sender,uint256 amount0In,uint256 amount1In,uint256 amount0Out,uint256 amount1Out,address indexed to)";
const token0Abi = "address:token0";
const token1Abi = "address:token1";

const fetch = async (options: FetchOptions): Promise<FetchResultFees> => {
  if (options.chain !== CHAIN.PULSECHAIN) {
    throw new Error("REP369 adapter only supports PulseChain");
  }

  const pairToken0 = (await options.api.call({ target: MAIN_PAIR, abi: token0Abi }))?.toLowerCase();
  const pairToken1 = (await options.api.call({ target: MAIN_PAIR, abi: token1Abi }))?.toLowerCase();

  if (![pairToken0, pairToken1].includes(REP369) || ![pairToken0, pairToken1].includes(WPLS)) {
    throw new Error("REP369 main pair does not match REP369/WPLS");
  }

  const rep369Is0 = pairToken0 === REP369;
  const logs = await options.getLogs({ targets: [MAIN_PAIR], eventAbi: swapEvent });

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  for (const log of logs) {
    const rIn = BigInt(rep369Is0 ? log.amount0In : log.amount1In);
    const rOut = BigInt(rep369Is0 ? log.amount0Out : log.amount1Out);
    const otherIn = BigInt(rep369Is0 ? log.amount1In : log.amount0In);
    const otherOut = BigInt(rep369Is0 ? log.amount1Out : log.amount0Out);

    // Count both legs in the same convention used by V2 swap adapters.
    if (rIn > 0n) dailyVolume.add(REP369, rIn.toString());
    if (rOut > 0n) dailyVolume.add(REP369, rOut.toString());
    if (otherIn > 0n) dailyVolume.add(WPLS, otherIn.toString());
    if (otherOut > 0n) dailyVolume.add(WPLS, otherOut.toString());

    // REP369 token tax direction:
    // buy  = REP369 is the output leg => 3% total tax (2% LP, 1% REP rewards)
    // sell = REP369 is the input leg  => 9% total tax (4% LP, 4% REP rewards, 1% burn)
    if (rOut > 0n && otherIn > 0n) {
      const totalTax = (rOut * 3n) / 100n;
      const lpTax = (rOut * 2n) / 100n;
      const holderTax = (rOut * 1n) / 100n;
      dailyFees.add(REP369, totalTax.toString());
      dailySupplySideRevenue.add(REP369, lpTax.toString());
      dailyHoldersRevenue.add(REP369, holderTax.toString());
    } else if (rIn > 0n && otherOut > 0n) {
      const totalTax = (rIn * 9n) / 100n;
      const lpTax = (rIn * 4n) / 100n;
      const holderTax = (rIn * 4n) / 100n;
      dailyFees.add(REP369, totalTax.toString());
      dailySupplySideRevenue.add(REP369, lpTax.toString());
      dailyHoldersRevenue.add(REP369, holderTax.toString());
    }
  }

  const dailyRevenue = dailyHoldersRevenue.clone();

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
    dailyProtocolRevenue: 0,
  };
};

const methodology = {
  Volume:
    "Volume is derived from Swap events of the REP369/WPLS PulseX V2 pair, counting the traded REP369 and WPLS legs on-chain.",
  UserFees:
    "REP369 charges 3% tax on buys (2% auto-liquidity + 1% REP rewards) and 9% tax on sells (4% auto-liquidity + 4% REP rewards + 1% burn), according to the project's public token configuration.",
  Fees:
    "REP369 trading taxes are counted from REP369 amounts in on-chain PulseX V2 Swap events. Buy tax is 3%; sell tax is 9%.",
  Revenue:
    "Revenue is the REP reward portion of the REP369 tax: 1% on buys and 4% on sells, directed to the project's reward mechanism.",
  SupplySideRevenue:
    "Supply-side revenue is the auto-liquidity portion of REP369 tax: 2% on buys and 4% on sells.",
  HoldersRevenue:
    "Holders revenue is the REP reward portion of the REP369 tax: 1% on buys and 4% on sells.",
  ProtocolRevenue:
    "No separate protocol treasury share is counted. The remaining sell-tax component includes the 1% burn allocation and is not counted as revenue.",
};

const breakdownMethodology = {
  Fees: {
    "REP369 Buy Tax": "3% of the REP369 buy-side output amount in the main REP369/WPLS pair.",
    "REP369 Sell Tax": "9% of the REP369 sell-side input amount in the main REP369/WPLS pair.",
  },
  Revenue: {
    "REP Rewards": "1% of buy-side REP369 and 4% of sell-side REP369, allocated to REP rewards.",
  },
  SupplySideRevenue: {
    "Auto LP": "2% of buy-side REP369 and 4% of sell-side REP369, allocated to liquidity provision.",
  },
  HoldersRevenue: {
    "REP Rewards": "1% of buy-side REP369 and 4% of sell-side REP369, allocated to holders through the REP reward mechanism.",
  },
};

export default {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.PULSECHAIN]: {
      fetch,
      start: "2023-08-01",
    },
  },
  methodology,
  breakdownMethodology,
};
