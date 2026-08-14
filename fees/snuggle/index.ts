import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Snuggle manages concentrated liquidity positions and keeps a share of what those positions earn.
// The vault reports the cut it took on each harvest, already split between its treasury and the
// referrer of the depositor: https://docs.snuggle.fi
const PERFORMANCE_FEE_EVENT = "event PerformanceFeeCollected(uint256 indexed tokenId, address indexed token, uint256 feeAmount, uint256 treasuryAmount, uint256 referralAmount)";

// share of the earnings the vault keeps, stored per vault in basis points
const PERFORMANCE_FEE_ABI = "uint256:performanceFeeBps";
const BPS_DENOMINATOR = 10000n;

const METRIC = {
  LP_FEES: "Liquidity Position Fees",
  TO_DEPOSITORS: "Position Fees To Depositors",
  TO_TREASURY: "Performance Fee To Treasury",
  TO_REFERRERS: "Performance Fee To Referrers",
}

const chainConfig: Record<string, { vaults: string[], start: string }> = {
  [CHAIN.BASE]: {
    vaults: [
      "0xd3923beccb6e1ddb048ed00a0a9bd602d16b7470", // Snuggle
      "0x7d27cdfbfcc878f7e7349e216d44204bfd2afd55", // MaxFi
    ],
    start: "2026-02-14",
  },
  [CHAIN.ARBITRUM]: {
    vaults: ["0x413Ca90D38D964546c2fE03cB103df57372630F6"],
    start: "2026-02-27",
  },
  [CHAIN.ROBINHOOD]: {
    vaults: ["0x1195C074F898b7644bA732407619c9804dFE6DCE"], // MaxFi
    start: "2026-07-25",
  },
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const { vaults } = chainConfig[options.chain];

  const feeBps = await options.api.multiCall({ abi: PERFORMANCE_FEE_ABI, calls: vaults, permitFailure: true });
  const logsPerVault = await options.getLogs({ targets: vaults, eventAbi: PERFORMANCE_FEE_EVENT, flatten: false });

  logsPerVault.forEach((logs: any[], i: number) => {
    if (!feeBps[i]) return;
    const bps = BigInt(feeBps[i]);

    logs.forEach((log: any) => {
      const fee = BigInt(log.feeAmount);
      const earned = (fee * BPS_DENOMINATOR) / bps;

      dailyFees.add(log.token, earned, METRIC.LP_FEES);
      dailySupplySideRevenue.add(log.token, earned - fee, METRIC.TO_DEPOSITORS);
      dailySupplySideRevenue.add(log.token, log.referralAmount, METRIC.TO_REFERRERS);
      dailyRevenue.add(log.token, log.treasuryAmount, METRIC.TO_TREASURY);
      dailyProtocolRevenue.add(log.token, log.treasuryAmount, METRIC.TO_TREASURY);
    });
  });

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
}

const methodology = {
  Fees: "Fees earned by the concentrated liquidity positions the vaults manage, recovered from the performance fee the vault reports on each harvest.",
  Revenue: "The share of those earnings kept by Snuggle, 15% of the position's earnings, minus what is paid out to referrers.",
  ProtocolRevenue: "All revenue goes to the vault treasury.",
  SupplySideRevenue: "What the depositors keep of their positions' earnings, plus the referral share paid out of the performance fee.",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.LP_FEES]: "Fees the managed positions earned before the performance fee was taken.",
  },
  Revenue: {
    [METRIC.TO_TREASURY]: "Performance fee sent to the vault treasury.",
  },
  ProtocolRevenue: {
    [METRIC.TO_TREASURY]: "Performance fee sent to the vault treasury.",
  },
  SupplySideRevenue: {
    [METRIC.TO_DEPOSITORS]: "Position earnings left with the depositors after the performance fee.",
    [METRIC.TO_REFERRERS]: "Share of the performance fee paid out to the depositor's referrer.",
  },
}

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  doublecounted: true, // the positions are uniswap v3, aerodrome, pancakeswap, sushiswap and camelot pools
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
}

export default adapter;
