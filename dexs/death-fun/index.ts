import type { SimpleAdapter } from "../../adapters/types";
import { FetchOptions, FetchResultV2, FetchV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// Death.fun
// Website: https://death.fun
// Docs: https://death-fun.notion.site/Smart-Contract-221bdfe69e5b818ead10de3a0c9d0f7f
// Abstract proxy: 0x27EDd16eE56958fddCBA08947f12C43DDeC2B20C
//
// Methodology summary:
// - Volume = total ETH wagered by players.
// - Fees = gross gaming revenue (GGR) = wagers - payouts.
// - SupplySideRevenue = referral rewards paid from contract funds.
// - Revenue/ProtocolRevenue = GGR - referral rewards.
//
// Direct bankroll deposits and owner withdrawals affect TVL/bankroll balance,
// but are excluded from fees/revenue because they are treasury movements rather
// than game outcomes.
const DEATH_FUN_CONTRACT = "0x27EDd16eE56958fddCBA08947f12C43DDeC2B20C";

const abi = {
  gameCreated:
    "event GameCreated(string preliminaryGameId, uint256 indexed onChainGameId, address indexed player, uint256 betAmount, bytes32 gameSeedHash)",

  betIncrease:
    "event BetIncrease(uint256 indexed onChainGameId, uint256 amount, address indexed player)",

  payoutSent:
    "event PayoutSent(uint256 indexed onChainGameId, uint256 amount, address indexed recipient)",

  referralPaid:
    "event ReferralPaid(address indexed recipient, uint256 amount, address indexed admin)",
};

const fetch: FetchV2 = async ({
  getLogs,
  createBalances,
}: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  const [gameCreatedLogs, betIncreaseLogs, payoutLogs, referralLogs] =
    await Promise.all([
      getLogs({
        target: DEATH_FUN_CONTRACT,
        eventAbi: abi.gameCreated,
      }),
      getLogs({
        target: DEATH_FUN_CONTRACT,
        eventAbi: abi.betIncrease,
      }),
      getLogs({
        target: DEATH_FUN_CONTRACT,
        eventAbi: abi.payoutSent,
      }),
      getLogs({
        target: DEATH_FUN_CONTRACT,
        eventAbi: abi.referralPaid,
      }),
    ]);

  let wagered = 0n;
  let payouts = 0n;
  let referrals = 0n;

  for (const log of gameCreatedLogs) {
    const amount = BigInt(log.betAmount);

    wagered += amount;
    dailyVolume.addGasToken(amount);
  }

  for (const log of betIncreaseLogs) {
    const amount = BigInt(log.amount);

    wagered += amount;
    dailyVolume.addGasToken(amount);
  }

  for (const log of payoutLogs) {
    payouts += BigInt(log.amount);
  }

  for (const log of referralLogs) {
    const amount = BigInt(log.amount);

    referrals += amount;
    dailySupplySideRevenue.addGasToken(amount, "Referral Rewards");
  }

  const grossGamingRevenue = wagered - payouts;
  const protocolRevenue = grossGamingRevenue - referrals;

  dailyFees.addGasToken(grossGamingRevenue, "Gross Gaming Revenue");
  dailyRevenue.addGasToken(protocolRevenue, METRIC.PROTOCOL_FEES);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume:
    "Total ETH wagered by players across Death.fun games, including initial wagers and additional in-game wager increases.",
  Fees:
    "Gross gaming revenue (GGR): total ETH wagered by players minus total ETH paid out to players. Can be negative when players win more than they lose during a period.",
  Revenue:
    "Protocol revenue is GGR minus referral rewards paid from contract funds. Direct bankroll deposits and owner withdrawals are treasury movements and are excluded.",
  ProtocolRevenue:
    "Same as Revenue. GGR retained by the protocol after referral rewards. Direct bankroll deposits and owner withdrawals are excluded.",
  SupplySideRevenue:
    "Referral rewards paid from contract funds.",
};

const breakdownMethodology = {
  Fees: {
    "Gross Gaming Revenue":
      "Total ETH wagered by players minus total ETH paid out to players.",
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]:
      "GGR retained by the protocol after referral rewards. Treasury movements such as direct bankroll deposits and owner withdrawals are excluded.",
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_FEES]:
      "GGR retained by the protocol after referral rewards. Treasury movements such as direct bankroll deposits and owner withdrawals are excluded.",
  },
  SupplySideRevenue: {
    "Referral Rewards": "Referral rewards paid from contract funds.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ABSTRACT],
  start: "2025-05-23",
  methodology,
  breakdownMethodology,
  allowNegativeValue: true,
};

export default adapter;
