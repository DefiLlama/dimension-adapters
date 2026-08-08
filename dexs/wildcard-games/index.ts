import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// Game contract addresses come from the protocol's deployment registry and can
// be verified on the explorers: https://basescan.org and
// https://robinhoodchain.blockscout.com
const chainConfig: Record<string, { start: string; games: string[] }> = {
  [CHAIN.BASE]: {
    start: "2026-07-17",
    games: [
      "0xa28bc22a055ea420141e9345b2ac9278398b8f34", // crash
      "0x9a6beb41138812dd467e7813359b1283c40d411d", // flip
      "0x8d0d0e1d2fe13428518bc5306086fe6c6c775e66", // rps
      "0xbf8fd8909456d23b2ab0b6ed32295cde718cf442", // wheel
      "0x1133d4e2f063f02a1ac8183f718d1ab6b1a375e0", // dice
      "0x2398d1109f2838ee399b1311c1d0fcecfd6e2179", // keno
      "0xb2e41b2241c578c3a3990ff0e35d5146f675aef1", // hi-lo
      "0xd5b4970e490d19a47d3c06092d4626cd3d9b0f79", // slots
      "0x015790eeb74a61798ac7f6d8efc920e975f189f9", // modern slots
    ],
  },
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
