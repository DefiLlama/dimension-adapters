import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { httpGet } from "../../utils/fetchURL";
import PromisePool from "@supercharge/promise-pool";

const HIRO_API = "https://api.hiro.so/extended/v1";

const STX_CG_ID = "blockstack";
const BTC_CG_ID = "bitcoin";

const STACKING_DAO_CONTRACT = "SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG";
const REWARDS_CONTRACTS = [
  `${STACKING_DAO_CONTRACT}.rewards-v2`,
  `${STACKING_DAO_CONTRACT}.rewards-v3`,
  `${STACKING_DAO_CONTRACT}.rewards-v4`,
  `${STACKING_DAO_CONTRACT}.rewards-v5`,
  `${STACKING_DAO_CONTRACT}.rewards-v8`,
];
const INSTANT_UNSTACK_CONTRACTS = [
  `${STACKING_DAO_CONTRACT}.stacking-dao-core-v1`,
  `${STACKING_DAO_CONTRACT}.stacking-dao-core-v2`,
  `${STACKING_DAO_CONTRACT}.stacking-dao-core-v3`,
  `${STACKING_DAO_CONTRACT}.stacking-dao-core-v4`,
  `${STACKING_DAO_CONTRACT}.stacking-dao-core-v5`,
  `${STACKING_DAO_CONTRACT}.stacking-dao-core-v6`,
  `${STACKING_DAO_CONTRACT}.stacking-dao-core-btc-v1`,
  `${STACKING_DAO_CONTRACT}.stacking-dao-core-btc-v2`,
  `${STACKING_DAO_CONTRACT}.stacking-dao-core-btc-v3`,
];

const USTX_PER_STX = 1e6;
const SATS_PER_BTC = 1e8;
const HIRO_LIMIT = 50;
const HIRO_CONCURRENCY = 2;
const PROTOCOL_STX = "protocol-stx";
const COMMISSION_STX = "commission-stx";
const PROTOCOL_SBTC = "protocol-sbtc";
const COMMISSION_SBTC = "commission-sbtc";
const STX_FEE_AMOUNT = "stx-fee-amount";

const parseUints = (repr: string | undefined) =>
  Object.fromEntries([...(repr ?? "").matchAll(/([\w-]+) u(\d+)/g)].map(([, key, value]) => [key, Number(value)]));

const getTxs = async (options: FetchOptions, contract: string, functionName: string) => {
  const txs: any[] = [];

  for (let offset = 0, total = 1; offset < total;) {
    const res = await httpGet(
      `${HIRO_API}/tx?limit=${HIRO_LIMIT}&offset=${offset}&contract_id=${contract}&function_name=${functionName}&start_time=${options.startTimestamp}&end_time=${options.endTimestamp}`
    );

    if (!Array.isArray(res.results) || typeof res.total !== "number") {
      throw new Error(`Unexpected Hiro tx response for ${contract}.${functionName}`);
    }

    txs.push(...res.results.filter((tx: any) => tx.tx_status === "success"));
    total = res.total;
    offset += res.limit ?? HIRO_LIMIT;
  }

  return txs;
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyUserFees = options.createBalances();

  const { results: rewardResults, errors: rewardErrors } = await PromisePool.withConcurrency(HIRO_CONCURRENCY)
    .for(REWARDS_CONTRACTS)
    .process((contract) => getTxs(options, contract, "process-rewards"));
  if (rewardErrors.length) throw new Error(`Reward fetch failed: ${rewardErrors[0]}`);

  const { results: instantUnstackResults, errors: instantUnstackErrors } = await PromisePool.withConcurrency(HIRO_CONCURRENCY)
    .for(INSTANT_UNSTACK_CONTRACTS)
    .process((contract) => getTxs(options, contract, "withdraw-idle"));

  if (instantUnstackErrors.length) throw new Error(`Instant unstake fetch failed: ${instantUnstackErrors[0]}`);

  const rewardTxs = rewardResults.flat();
  const instantUnstackTxs = instantUnstackResults.flat();

  for (const tx of rewardTxs) {
    const repr = tx.tx_result?.repr;
    const uints = parseUints(repr);
    if (!(PROTOCOL_STX in uints) && !(COMMISSION_STX in uints) && !(PROTOCOL_SBTC in uints) && !(COMMISSION_SBTC in uints)) {
      throw new Error(`Unexpected StackingDAO process-rewards result: ${repr}`);
    }

    const stxRewards = (uints[PROTOCOL_STX] ?? 0) / USTX_PER_STX;
    const stxCommission = (uints[COMMISSION_STX] ?? 0) / USTX_PER_STX;
    const btcRewards = (uints[PROTOCOL_SBTC] ?? 0) / SATS_PER_BTC;
    const btcCommission = (uints[COMMISSION_SBTC] ?? 0) / SATS_PER_BTC;

    dailyFees.addCGToken(STX_CG_ID, stxRewards + stxCommission, METRIC.STAKING_REWARDS);
    dailySupplySideRevenue.addCGToken(STX_CG_ID, stxRewards, METRIC.STAKING_REWARDS);
    dailyRevenue.addCGToken(STX_CG_ID, stxCommission, METRIC.PROTOCOL_FEES);
    dailyProtocolRevenue.addCGToken(STX_CG_ID, stxCommission, METRIC.PROTOCOL_FEES);

    dailyFees.addCGToken(BTC_CG_ID, btcRewards + btcCommission, METRIC.STAKING_REWARDS);
    dailySupplySideRevenue.addCGToken(BTC_CG_ID, btcRewards, METRIC.STAKING_REWARDS);
    dailyRevenue.addCGToken(BTC_CG_ID, btcCommission, METRIC.PROTOCOL_FEES);
    dailyProtocolRevenue.addCGToken(BTC_CG_ID, btcCommission, METRIC.PROTOCOL_FEES);
  }

  for (const tx of instantUnstackTxs) {
    const repr = tx.tx_result?.repr;
    const uints = parseUints(repr);
    if (!(STX_FEE_AMOUNT in uints)) throw new Error(`Unexpected StackingDAO withdraw-idle result: ${repr}`);

    const fee = (uints[STX_FEE_AMOUNT] ?? 0) / USTX_PER_STX;
    dailyFees.addCGToken(STX_CG_ID, fee, METRIC.DEPOSIT_WITHDRAW_FEES);
    dailyUserFees.addCGToken(STX_CG_ID, fee, METRIC.DEPOSIT_WITHDRAW_FEES);
    dailyRevenue.addCGToken(STX_CG_ID, fee, METRIC.DEPOSIT_WITHDRAW_FEES);
    dailyProtocolRevenue.addCGToken(STX_CG_ID, fee, METRIC.DEPOSIT_WITHDRAW_FEES);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyUserFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.STACKS],
  start: "2025-02-03",
  methodology: {
    Fees:
      "Liquid stacking rewards for stSTX and stSTXbtc, including any explicit reward commission and instant unstake fees.",
    UserFees: "Instant Unstake fees paid directly by users.",
    Revenue: "Explicit reward commission and instant unstake fees retained by the protocol.",
    ProtocolRevenue: "Explicit reward commission and instant unstake fees retained by the protocol.",
    SupplySideRevenue: "Processed rewards sent to the stSTX reserve and stSTXbtc contracts as staking reward.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.STAKING_REWARDS]:
        "PoX rewards processed through StackingDAO rewards contracts for stSTX and stSTXbtc, including any explicit commission.",
      [METRIC.DEPOSIT_WITHDRAW_FEES]: "Fees charged when users withdraw immediately through instant unstake.",
    },
    UserFees: {
      [METRIC.DEPOSIT_WITHDRAW_FEES]: "Instant unstake fees paid directly by users.",
    },
    Revenue: {
      [METRIC.PROTOCOL_FEES]: "Explicit reward commission processed through StackingDAO rewards contracts.",
      [METRIC.DEPOSIT_WITHDRAW_FEES]: "Instant unstake fees retained by the protocol.",
    },
    ProtocolRevenue: {
      [METRIC.PROTOCOL_FEES]: "Explicit reward commission processed through StackingDAO rewards contracts.",
      [METRIC.DEPOSIT_WITHDRAW_FEES]: "Instant unstake fees retained by the protocol.",
    },
    SupplySideRevenue: {
      [METRIC.STAKING_REWARDS]: "Processed rewards sent to the stSTX reserve and stSTXbtc contracts as staking reward.",
    },
  },
};

export default adapter;
