import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { queryAllium } from "../../helpers/allium";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { httpGet } from "../../utils/fetchURL";
import PromisePool from "@supercharge/promise-pool";

const HIRO_API = "https://api.hiro.so/extended/v1";

const STX_CG_ID = "blockstack";
const BTC_CG_ID = "bitcoin";

const STACKING_DAO_CONTRACT = "SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG";

// Legacy contract set: last successful process-rewards on rewards-v8 was 2026-08-12, withdraw-idle on core-v6 2026-07-29 and core-btc-v3 2026-07-30
const LEGACY_END = Date.UTC(2026, 7, 13) / 1e3;
const REWARDS_CONTRACTS = [2, 3, 4, 5, 8].map((v) => `${STACKING_DAO_CONTRACT}.rewards-v${v}`);
const INSTANT_UNSTACK_CONTRACTS = [
  ...[1, 2, 3, 4, 5, 6].map((v) => `${STACKING_DAO_CONTRACT}.stacking-dao-core-v${v}`),
  ...[1, 2, 3].map((v) => `${STACKING_DAO_CONTRACT}.stacking-dao-core-btc-v${v}`),
];

// Current contract set, first deployed 2026-07-30 (signer-payout-v1, rewards-pox5-v1, stacking-dao-core-stbtc-v1)
const CURRENT_START = Date.UTC(2026, 6, 30) / 1e3;
const SBTC_ASSET = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token::sbtc-token";
// Receives sBTC bond rewards from the signer-manager contracts and releases them on every fold (process-rewards, deposits, withdrawals, swaps)
const REWARDS_POX5 = `${STACKING_DAO_CONTRACT}.rewards-pox5-v1`;
// Forwards signer-basispoints (10000 = 100% as of 2026-10-27) of the commission it receives to signer-payout-v1, which pays signers via distribute
const COMMISSION_SBTC = `${STACKING_DAO_CONTRACT}.commission-sbtc-v1`;
const SIGNER_PAYOUT = `${STACKING_DAO_CONTRACT}.signer-payout-v1`;
// Protocol fee receiver: per-fold sBTC commission from rewards-pox5-v1 and stSTXbtc instant unstake fees from stx-reserve-v2
const FEE_RECEIVER = "SP01R9J9S0R3TRQ9EWW88TEE43N0KPBKFYTFH5D9";
const STX_RESERVE = `${STACKING_DAO_CONTRACT}.stx-reserve-v2`;
// Split recipients of rewards-pox5-v1 that pass rewards to holders
const HOLDER_RECIPIENTS = [
  `${STACKING_DAO_CONTRACT}.stbtc-reserve`, // stBTC holders
  `${STACKING_DAO_CONTRACT}.ststxbtc-tracking-v2`, // stSTXbtc holders
  // stSTX holders: swaps sBTC to STX and sends it via SPZ6GHTTFZR43S2JMRTDJA2ZYHJDVV8ZSVZHNSVM to rewards-stx-v2.add-rewards, so the STX stream is not counted again
  "SP19E4PBQXGKY8C3977BA828HVGW2C8YH9KK9Y8AJ",
];
const CORE_STX = `${STACKING_DAO_CONTRACT}.stacking-dao-core-stx-v2`; // fee stays in stx-reserve-v2 (stSTX holders)
const CORE_STBTC = `${STACKING_DAO_CONTRACT}.stacking-dao-core-stbtc-v1`; // fee stays in stbtc-reserve (stBTC holders)
const CORE_STSTXBTC = `${STACKING_DAO_CONTRACT}.stacking-dao-core-ststxbtc-v2`; // fee is paid from stx-reserve-v2 to FEE_RECEIVER
// Skims fee-bps (500 = 5% as of 2026-10-27) of native pool stakers' sBTC rewards to its fee receiver; no staker claims yet as of 2026-10-27
const NATIVE_POOL = `${STACKING_DAO_CONTRACT}.native-pool-signer-manager-v2`;

const USTX_PER_STX = 1e6;
const SATS_PER_BTC = 1e8;
const HIRO_LIMIT = 50;
const HIRO_CONCURRENCY = 2;

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

const fetchLegacy = async (options: FetchOptions, balances: Record<string, any>) => {
  const { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue, dailyUserFees } = balances;

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
    if (!("protocol-stx" in uints) && !("commission-stx" in uints) && !("protocol-sbtc" in uints) && !("commission-sbtc" in uints)) {
      throw new Error(`Unexpected StackingDAO process-rewards result: ${repr}`);
    }

    const stxRewards = (uints["protocol-stx"] ?? 0) / USTX_PER_STX;
    const stxCommission = (uints["commission-stx"] ?? 0) / USTX_PER_STX;
    const btcRewards = (uints["protocol-sbtc"] ?? 0) / SATS_PER_BTC;
    const btcCommission = (uints["commission-sbtc"] ?? 0) / SATS_PER_BTC;

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
    if (!("stx-fee-amount" in uints)) throw new Error(`Unexpected StackingDAO withdraw-idle result: ${repr}`);

    const fee = (uints["stx-fee-amount"] ?? 0) / USTX_PER_STX;
    dailyFees.addCGToken(STX_CG_ID, fee, METRIC.DEPOSIT_WITHDRAW_FEES);
    dailyUserFees.addCGToken(STX_CG_ID, fee, METRIC.DEPOSIT_WITHDRAW_FEES);
    dailyRevenue.addCGToken(STX_CG_ID, fee, METRIC.DEPOSIT_WITHDRAW_FEES);
    dailyProtocolRevenue.addCGToken(STX_CG_ID, fee, METRIC.DEPOSIT_WITHDRAW_FEES);
  }
};

const fetchCurrent = async (options: FetchOptions, balances: Record<string, any>) => {
  const { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue, dailyUserFees } = balances;

  // transfers are attributed by sender/recipient, not by called function, because rewards are released inside many entry points (cores, swaps, Zest routers)
  const rows: { kind: string; asset_id: string | null; sender: string | null; recipient: string | null; amount: string | null; n: number; repr: string | null }[] = await queryAllium(`
    WITH ev AS (
      SELECT e.tx_id, e.event_type, e.event_contents AS c
      FROM stacks.raw.events e
      JOIN stacks.raw.transactions t ON e.tx_id = t.tx_id
      WHERE e.burn_block_time >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
        AND e.burn_block_time <  TO_TIMESTAMP_NTZ(${options.endTimestamp})
        AND t.tx_status = 'success'
        AND t.canonical
        AND e.event_type IN ('fungible_token_asset', 'stx_asset', 'smart_contract_log')
    ),
    reward_out AS (
      SELECT
        tx_id,
        c:asset:asset_id::string  AS asset_id,
        c:asset:sender::string    AS sender,
        c:asset:recipient::string AS recipient,
        c:asset:amount::number    AS amount
      FROM ev
      WHERE event_type = 'fungible_token_asset'
        AND c:asset:asset_event_type::string = 'transfer'
        AND c:asset:sender::string IN ('${REWARDS_POX5}', '${COMMISSION_SBTC}')
    )
    SELECT 'transfer' AS kind, asset_id, sender, recipient, SUM(amount)::string AS amount, COUNT(*) AS n, NULL AS repr
    FROM reward_out
    WHERE sender = '${REWARDS_POX5}'
      OR (recipient = '${SIGNER_PAYOUT}' AND tx_id IN (
        SELECT tx_id FROM reward_out WHERE sender = '${REWARDS_POX5}' AND recipient = '${COMMISSION_SBTC}'
      ))
    GROUP BY asset_id, sender, recipient
    UNION ALL
    SELECT 'stx_fee_transfer', NULL, NULL, NULL, SUM(c:asset:amount::number)::string, COUNT(*), NULL
    FROM ev
    WHERE event_type = 'stx_asset'
      AND c:asset:asset_event_type::string = 'transfer'
      AND c:asset:sender::string = '${STX_RESERVE}'
      AND c:asset:recipient::string = '${FEE_RECEIVER}'
    UNION ALL
    SELECT 'log', NULL, c:contract_log:contract_id::string, NULL, NULL, 1, c:contract_log:value:repr::string
    FROM ev
    WHERE event_type = 'smart_contract_log'
      AND c:contract_log:contract_id::string IN ('${CORE_STX}', '${CORE_STBTC}', '${CORE_STSTXBTC}', '${NATIVE_POOL}')
      AND (
        c:contract_log:value:repr::string LIKE '%(action "withdraw-idle")%'
        OR c:contract_log:value:repr::string LIKE '%(action "claim-staker-rewards")%'
        OR c:contract_log:value:repr::string LIKE '%(action "claim-staker-to-custody")%'
      )
  `);

  let signerCommission = 0;
  let commissionIn = 0;
  let ststxbtcFeeLogs = 0;
  let ststxbtcFeeTransfers = 0;

  for (const row of rows) {
    if (row.kind === "transfer") {
      if (row.asset_id !== SBTC_ASSET) throw new Error(`Unexpected StackingDAO reward asset: ${row.asset_id} from ${row.sender}`);
      const btc = Number(row.amount) / SATS_PER_BTC;

      if (row.sender === COMMISSION_SBTC) {
        signerCommission += btc;
        continue;
      }

      if (HOLDER_RECIPIENTS.includes(row.recipient!)) {
        dailyFees.addCGToken(BTC_CG_ID, btc, METRIC.STAKING_REWARDS);
        dailySupplySideRevenue.addCGToken(BTC_CG_ID, btc, METRIC.STAKING_REWARDS);
      } else if (row.recipient === FEE_RECEIVER) {
        dailyFees.addCGToken(BTC_CG_ID, btc, METRIC.STAKING_REWARDS);
        dailyRevenue.addCGToken(BTC_CG_ID, btc, METRIC.PROTOCOL_FEES);
        dailyProtocolRevenue.addCGToken(BTC_CG_ID, btc, METRIC.PROTOCOL_FEES);
      } else if (row.recipient === COMMISSION_SBTC) {
        commissionIn += btc;
      } else {
        throw new Error(`Unexpected StackingDAO rewards-pox5-v1 recipient: ${row.recipient}`);
      }
      continue;
    }

    if (row.kind === "stx_fee_transfer") {
      ststxbtcFeeTransfers += Number(row.n);
      continue;
    }

    const uints = parseUints(row.repr ?? undefined);
    if (row.sender === NATIVE_POOL) {
      if (!("earned" in uints) || !("net" in uints)) throw new Error(`Unexpected StackingDAO native pool claim log: ${row.repr}`);
      const earned = uints.earned / SATS_PER_BTC;
      const net = uints.net / SATS_PER_BTC;
      dailyFees.addCGToken(BTC_CG_ID, earned, METRIC.STAKING_REWARDS);
      dailySupplySideRevenue.addCGToken(BTC_CG_ID, net, METRIC.STAKING_REWARDS);
      dailyRevenue.addCGToken(BTC_CG_ID, earned - net, METRIC.PROTOCOL_FEES);
      dailyProtocolRevenue.addCGToken(BTC_CG_ID, earned - net, METRIC.PROTOCOL_FEES);
      continue;
    }

    const feeKey = row.sender === CORE_STBTC ? "sbtc-fee" : "stx-fee";
    if (!(feeKey in uints)) throw new Error(`Unexpected StackingDAO withdraw-idle log: ${row.repr}`);
    const cgId = row.sender === CORE_STBTC ? BTC_CG_ID : STX_CG_ID;
    const fee = uints[feeKey] / (row.sender === CORE_STBTC ? SATS_PER_BTC : USTX_PER_STX);

    dailyFees.addCGToken(cgId, fee, METRIC.DEPOSIT_WITHDRAW_FEES);
    dailyUserFees.addCGToken(cgId, fee, METRIC.DEPOSIT_WITHDRAW_FEES);
    if (row.sender === CORE_STSTXBTC) {
      ststxbtcFeeLogs++;
      dailyRevenue.addCGToken(cgId, fee, METRIC.DEPOSIT_WITHDRAW_FEES);
      dailyProtocolRevenue.addCGToken(cgId, fee, METRIC.DEPOSIT_WITHDRAW_FEES);
    } else {
      dailySupplySideRevenue.addCGToken(cgId, fee, METRIC.DEPOSIT_WITHDRAW_FEES);
    }
  }

  // every stSTXbtc instant unstake pays its fee from stx-reserve-v2 to the fee receiver; transfers without matching logs mean the log fields were not read
  if (ststxbtcFeeTransfers > 0 && ststxbtcFeeLogs === 0) {
    throw new Error(`StackingDAO: ${ststxbtcFeeTransfers} stSTXbtc fee transfers but no withdraw-idle logs read`);
  }

  // commission-sbtc-v1 forwards the signer share in the same tx and keeps the rest for the treasury
  dailyFees.addCGToken(BTC_CG_ID, commissionIn, METRIC.STAKING_REWARDS);
  dailySupplySideRevenue.addCGToken(BTC_CG_ID, signerCommission, METRIC.STAKING_REWARDS);
  dailyRevenue.addCGToken(BTC_CG_ID, commissionIn - signerCommission, METRIC.PROTOCOL_FEES);
  dailyProtocolRevenue.addCGToken(BTC_CG_ID, commissionIn - signerCommission, METRIC.PROTOCOL_FEES);
};

const fetch = async (options: FetchOptions) => {
  const balances = {
    dailyFees: options.createBalances(),
    dailyRevenue: options.createBalances(),
    dailyProtocolRevenue: options.createBalances(),
    dailySupplySideRevenue: options.createBalances(),
    dailyUserFees: options.createBalances(),
  };

  // date-based switch between contract sets so refills of old days keep the legacy numbers
  if (options.startTimestamp < LEGACY_END) await fetchLegacy(options, balances);
  if (options.endTimestamp > CURRENT_START) await fetchCurrent(options, balances);

  return balances;
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.STACKS],
  start: "2025-02-03",
  isExpensiveAdapter: true,
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    Fees:
      "Staking rewards earned by stSTX, stBTC and stSTXbtc holders and native pool stakers, including the commission taken by the protocol and signers, plus instant unstake fees paid by users.",
    UserFees: "Instant unstake fees paid directly by users on stSTX, stBTC and stSTXbtc.",
    Revenue: "Reward commission sent to the protocol fee receiver, the 5% native pool fee, and stSTXbtc instant unstake fees, all kept by the protocol.",
    ProtocolRevenue: "Reward commission sent to the protocol fee receiver, the 5% native pool fee, and stSTXbtc instant unstake fees, all sent to the protocol treasury.",
    SupplySideRevenue:
      "Staking rewards delivered to stSTX, stBTC and stSTXbtc holders and native pool stakers, commission paid to signers, and stSTX and stBTC instant unstake fees that stay in the reserves for holders.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.STAKING_REWARDS]:
        "Stacking and bond rewards released by StackingDAO rewards contracts and native pool staker claims, including commission.",
      [METRIC.DEPOSIT_WITHDRAW_FEES]: "Fees charged when users withdraw immediately through instant unstake.",
    },
    UserFees: {
      [METRIC.DEPOSIT_WITHDRAW_FEES]: "Instant unstake fees paid directly by users.",
    },
    Revenue: {
      [METRIC.PROTOCOL_FEES]: "Reward commission sent to the protocol fee receiver or kept by the commission contract, and the native pool fee.",
      [METRIC.DEPOSIT_WITHDRAW_FEES]: "Instant unstake fees retained by the protocol (stSTXbtc since August 2026, all products before).",
    },
    ProtocolRevenue: {
      [METRIC.PROTOCOL_FEES]: "Reward commission sent to the protocol fee receiver or kept by the commission contract, and the native pool fee.",
      [METRIC.DEPOSIT_WITHDRAW_FEES]: "Instant unstake fees retained by the protocol (stSTXbtc since August 2026, all products before).",
    },
    SupplySideRevenue: {
      [METRIC.STAKING_REWARDS]: "Rewards delivered to the stSTX, stBTC and stSTXbtc reserves and native pool stakers, and commission paid to signers.",
      [METRIC.DEPOSIT_WITHDRAW_FEES]: "stSTX and stBTC instant unstake fees that stay in the reserves and accrue to holders.",
    },
  },
};

export default adapter;
