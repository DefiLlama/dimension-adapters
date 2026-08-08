import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// Game contract addresses come from the protocol's deployment registry and can
// be verified on https://robinhoodchain.blockscout.com
const chainConfig: Record<string, { start: string; games: string[] }> = {
  [CHAIN.ROBINHOOD]: {
    start: "2026-07-30",
    games: [
      "0xdf081EB31ED0758AB577cede2bD2828450B47491", // crash
      "0xA28bc22A055EA420141E9345b2AC9278398b8F34", // flip
      "0xbf8fd8909456D23b2Ab0B6ED32295Cde718Cf442", // rps
      "0x7C38Ae89610cdAC88B8B83eeA5d6896760b172FF", // wheel
    ],
  },
};

const BET_SETTLED_ABI =
  "event BetSettled(uint256 indexed betId, address indexed player, address token, uint256 totalBetAmount, uint256 payout, uint256[] outcomes)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const logs = await options.getLogs({
    targets: chainConfig[options.chain].games,
    eventAbi: BET_SETTLED_ABI,
  });

  logs.forEach((log: any) => {
    dailyVolume.add(log.token, log.totalBetAmount);
    dailyFees.add(log.token, log.totalBetAmount - log.payout, METRIC.SERVICE_FEES);
  });

  return { dailyVolume, dailyFees, dailyRevenue: dailyFees };
};

const methodology = {
  Volume: "Total amount wagered by players, summed from BetSettled events emitted by every game contract.",
  Fees: "Gross gaming revenue: total wagered minus total paid out to players.",
  Revenue: "All gross gaming revenue accrues to the protocol treasury, which acts as the house bankroll.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SERVICE_FEES]: "Wagers minus payouts on every settled bet, i.e. the house gross gaming revenue.",
  },
  Revenue: {
    [METRIC.SERVICE_FEES]: "All gross gaming revenue is kept by the protocol treasury.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  // The house edge is a flat 5% total-loss chance applied in the base game
  // contract before each roll, so on low-volume days players can win more than
  // they wager and daily gross gaming revenue is legitimately negative.
  allowNegativeValue: true,
  methodology,
  breakdownMethodology,
  adapter: Object.fromEntries(
    Object.entries(chainConfig).map(([chain, { start }]) => [chain, { fetch, start }]),
  ),
};

export default adapter;
