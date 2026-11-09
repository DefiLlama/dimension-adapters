import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTransactionsJson, queryEventNodesInWindow } from "../helpers/sui";

// Typus SAFU vaults on Sui, read from the vault events (the Sentio insights API this used to query rejects its key since 2026-04).
// Package and registry ids: https://github.com/Typus-Lab/typus-config/blob/main/config-mainnet.json (PACKAGE_ORIGIN.SAFU, REGISTRY.SAFU.SAFU)
// SAFU vaults put deposits into lending markets (Typus DOV vaults from 2025) and spend the yield, topped up with Typus incentives,
// on DOV options. Depositors get the payoff of the options that end in the money, minus the Typus fee.
const MANAGER_EVENT = "0xa7bedeaa28ff3defa50d012812618178727f530bc5a70af5d03fc6424a984cc7::safu::ManagerEvent";

const OPTION_PAYOFFS = "Option Exercise Payoffs";

// post_exercise log: [vault index, round, payoff] until package v15; [vault index, round, payoff to depositors, fee] since
// post_exercise_v2 (package v16, published 2025-01-09 03:18 UTC), which moves vault.config[9] bp of the payoff into the fee pool.
const parseExercise = (log: string[]): { toDepositors: bigint; fee: bigint } => {
  if (log.length === 3) return { toDepositors: BigInt(log[2]), fee: 0n };
  if (log.length === 4) return { toDepositors: BigInt(log[2]), fee: BigInt(log[3]) };
  throw new Error(`typus-safu: unexpected post_exercise log ${log}`);
};

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const exercisesByTx: Record<string, string[][]> = {};
  for (const { json, digest } of await queryEventNodesInWindow(MANAGER_EVENT, options)) {
    if (json.action === "post_exercise") (exercisesByTx[digest] ??= []).push(json.log);
  }

  // The event has no token type (the payoff token can be a reward token, not the deposit token, before v16), so it is taken
  // from the safu::post_exercise<T> / post_exercise_v2<T> calls of the transaction, which emit the events in call order.
  // Out-of-the-money rounds log a zero payoff, so only transactions with a payoff are fetched.
  const paidTxs = Object.keys(exercisesByTx).filter((digest) => exercisesByTx[digest].some((log) => log.slice(2).some((v) => v !== "0")));
  const txs = await getTransactionsJson(paidTxs);

  for (const digest of paidTxs) {
    const calls = txs[digest].kind.programmableTransaction.commands
      .map((c: any) => c.moveCall)
      .filter((c: any) => c?.module === "safu" && c.function.startsWith("post_exercise"));
    const logs = exercisesByTx[digest];
    if (calls.length !== logs.length) throw new Error(`typus-safu: ${logs.length} post_exercise events but ${calls.length} calls in ${digest}`);
    logs.forEach((log, i) => {
      const token = calls[i].typeArguments[0];
      const { toDepositors, fee } = parseExercise(log);
      dailyFees.add(token, toDepositors + fee, OPTION_PAYOFFS);
      dailySupplySideRevenue.add(token, toDepositors, "Option Exercise Payoffs To Depositors");
      dailyRevenue.add(token, fee, "Option Exercise Payoffs To Protocol");
    });
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Payoffs SAFU vault depositors earn from the in-the-money options their vaults buy from Typus DOV vaults, before the Typus fee. Excludes the lending and DOV yield and the Typus incentives the vaults spend on those options, and the fee Typus takes from the part of them left unspent.",
  Revenue: "Share of SAFU option payoffs Typus keeps (a per-vault rate, 10% on most vaults) since January 2025; payoffs were not charged before.",
  ProtocolRevenue: "Share of SAFU option payoffs paid into the Typus fee pool (a per-vault rate, 10% on most vaults) since January 2025; payoffs were not charged before.",
  SupplySideRevenue: "SAFU option payoffs paid to vault depositors after the Typus fee.",
};

const breakdownMethodology = {
  Fees: {
    [OPTION_PAYOFFS]: "Payoffs of in-the-money options bought by SAFU vaults, before the Typus fee.",
  },
  Revenue: {
    "Option Exercise Payoffs To Protocol": "Typus fee on SAFU option payoffs, since January 2025.",
  },
  ProtocolRevenue: {
    "Option Exercise Payoffs To Protocol": "Typus fee on SAFU option payoffs, paid into the Typus fee pool since January 2025.",
  },
  SupplySideRevenue: {
    "Option Exercise Payoffs To Depositors": "SAFU option payoffs credited to vault depositors after the Typus fee.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SUI],
  start: "2024-09-07", // first SAFU option exercise
  deadFrom: "2026-07-30", // last SAFU round exercised 2026-07-29 11:05 UTC; every vault was closed on-chain on 2026-08-04 (safu::ManagerEvent "close")
  methodology,
  breakdownMethodology,
};

export default adapter;
