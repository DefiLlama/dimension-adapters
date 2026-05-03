import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const TRON_UNSTAKING_CONTRACT = "TURYwFtG6gvpEyPSm55FyjJWpgQQ2rDm5e";
const TRON_STUSDT = "TThzxNRLrW2Brp9DcTQU8i4Wd9udCWEdZ3";
const ETHEREUM_STUSDT = "0x25eC98773D7b4ceD4cAFaB96A2A1c0945f145e10";
const ETHEREUM_UNSTAKING_CONTRACT = "0x156269966404Ca72F6721c3228676c56412c058c";
const STUSDT_DECIMALS = 1e18;
const TETHER = "tether";

// Source: stUSDT contract emits IncreaseBase/DecreaseBase when totalUnderlying is rebased.
// Holder yield is the delta between newTotalUnderlying and oldTotalUnderlying; DecreaseBase is negative yield.
const IncreaseBaseEvent = "event IncreaseBase(uint256 oldTotalUnderlying, uint256 newTotalUnderlying, uint256 totalShares)";
const DecreaseBaseEvent = "event DecreaseBase(uint256 oldTotalUnderlying, uint256 newTotalUnderlying, uint256 totalShares)";
// Source: unstaking contract emits the retained withdraw fee in WithdrawalClaimed.fee.
const WithdrawalClaimedEvent = "event WithdrawalClaimed(uint256 indexed requestId, address indexed receiver, uint256 amount, uint256 fee, uint256 claimedToken)";

const toTokenAmount = (value: string | bigint | number) => Number(value) / STUSDT_DECIMALS;

const addRebaseYield = (balances: any, oldTotalUnderlying: bigint, newTotalUnderlying: bigint) => {
  const yieldAmount = toTokenAmount(newTotalUnderlying - oldTotalUnderlying);
  if (yieldAmount === 0) return;
  balances.addCGToken(TETHER, yieldAmount, METRIC.ASSETS_YIELDS);
};

const fetch = async (options: FetchOptions) => {
  const { createBalances } = options;
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  const contracts = options.chain === CHAIN.TRON
    ? { stusdt: TRON_STUSDT, unstaking: TRON_UNSTAKING_CONTRACT }
    : { stusdt: ETHEREUM_STUSDT, unstaking: ETHEREUM_UNSTAKING_CONTRACT };

  // Unstaking fees are retained by the protocol, so they count as both gross fees and revenue.
  const withdrawalLogs = await options.getLogs({
    target: contracts.unstaking,
    eventAbi: WithdrawalClaimedEvent,
  });
  for (const log of withdrawalLogs) {
    const fee = BigInt(log.fee);
    if (fee <= 0n) continue;
    const feeAmount = toTokenAmount(fee);
    dailyFees.addCGToken(TETHER, feeAmount, METRIC.DEPOSIT_WITHDRAW_FEES);
    dailyRevenue.addCGToken(TETHER, feeAmount, METRIC.DEPOSIT_WITHDRAW_FEES);
  }

  // Positive rebases increase stUSDT holder balances and are treated as supply-side yield.
  const rebaseLogs = await options.getLogs({
    target: contracts.stusdt,
    eventAbi: IncreaseBaseEvent,
  });
  for (const log of rebaseLogs) {
    const oldTotalUnderlying = BigInt(log.oldTotalUnderlying);
    const newTotalUnderlying = BigInt(log.newTotalUnderlying);
    addRebaseYield(dailySupplySideRevenue, oldTotalUnderlying, newTotalUnderlying);
  }

  // Negative rebases reduce holder balances, so this records a negative supply-side yield.
  const negativeRebaseLogs = await options.getLogs({
    target: contracts.stusdt,
    eventAbi: DecreaseBaseEvent,
  });
  for (const log of negativeRebaseLogs) {
    const oldTotalUnderlying = BigInt(log.oldTotalUnderlying);
    const newTotalUnderlying = BigInt(log.newTotalUnderlying);
    addRebaseYield(dailySupplySideRevenue, oldTotalUnderlying, newTotalUnderlying);
  }

  dailyFees.addBalances(dailySupplySideRevenue);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  allowNegativeValue: true,
  pullHourly: true,
  adapter: {
    [CHAIN.TRON]: {
      fetch,
      start: "2023-06-30",
    },
    [CHAIN.ETHEREUM]: {
      fetch,
      start: "2023-06-30",
    },
  },
  methodology: {
    Fees: "Fees include stUSDT unstaking fees and net stUSDT rebase yield distributed to holders.",
    Revenue: "Unstaking fees retained by the stUSDT-RWA contract are counted as protocol revenue.",
    ProtocolRevenue: "Unstaking fees retained by the stUSDT-RWA contract are counted as protocol revenue.",
    SupplySideRevenue: "Supply-side revenue is net stUSDT rebase yield from IncreaseBase and DecreaseBase events.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.DEPOSIT_WITHDRAW_FEES]: "The fee field from WithdrawalClaimed events, converted from stUSDT 18-decimal accounting to USDT units.",
      [METRIC.ASSETS_YIELDS]: "Net rebase yield from IncreaseBase and DecreaseBase events, calculated as newTotalUnderlying minus oldTotalUnderlying.",
    },
    Revenue: {
      [METRIC.DEPOSIT_WITHDRAW_FEES]: "The retained unstaking fee charged when users claim withdrawn USDT.",
    },
    ProtocolRevenue: {
      [METRIC.DEPOSIT_WITHDRAW_FEES]: "The retained unstaking fee charged when users claim withdrawn USDT.",
    },
    SupplySideRevenue: {
      [METRIC.ASSETS_YIELDS]: "Net rebase yield from IncreaseBase and DecreaseBase events distributed to stUSDT holders.",
    },
  },
};

export default adapter;
