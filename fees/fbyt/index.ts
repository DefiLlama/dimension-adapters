// FBYT (https://fbyt.io): on-chain money management on Solana. Money managers run vaults, investors deposit into them,
// and the vaults trade through Jupiter. Program (production): DNgg2FmwchUHYx2QiZ9pNJn1q5zypMprkSWFLUnNDigm. The staging
// program on the same cluster (FBYTcdsCZjCLSyCqffrxfuPGs6vUkyfnzB95FEEvZ9YW) is not counted, as in the TVL adapter.
//
// Fees, all sent by the program to the AdminPool's `admin` wallet at the time (AdminPool
// 8D4fE8ijbjTC1n5nA1Tmqzkm5CAjryBxbQwrkZ7A1kLE, see ADMINS for the wallets it has had):
// 1. Management fee (yearly % of the vault, set per vault by its manager) and performance fee (% of the investor's
//    profit above their high-water mark, charged when they withdraw). Paid by investors in the vault's tokens and split
//    on chain: FBYT keeps the AdminPool's protocol share (2000 bps of each fee since the first fee on 2026-04-12), the
//    manager gets the rest. Read from the program's Anchor events, which carry both amounts:
//      WithdrawMoneyManagementFeeEvent  vault, manager, mint, fee_amount (manager) u64 @104, admin_fee (FBYT) u64 @112
//      WithdrawTokenFundEvent           ..., mint @104, money_manager_fee u64 @156, performance_fee u64 @164 (both the
//                                       manager's part), admin_fee u64 @172 (FBYT's part of both)
//      WithdrawFeeSplitEvent            vault, investor, mint @72, then the manager's management and performance fee
//                                       and FBYT's management and performance fee, u64 @104, @112, @120, @128
//    WithdrawFeeSplitEvent is emitted next to every WithdrawTokenFundEvent since 2026-09-29. Before it, a withdrawal
//    reports FBYT's part of both fees as one amount; no such withdrawal charged both fees, so FBYT's part is the share
//    of the one fee it charged. Fields were only ever appended to these events, so the offsets hold for every size.
// 2. Trading fee: SOL paid by the trade's signer (manager or trading delegate) on every vault swap. 0.001 SOL per swap
//    until 2026-10-01, then a tiered % of the trade's USD value (1 bps, $0.01 minimum, $100 cap in October 2026).
// 3. Vault creation fee: SOL paid by the manager when creating a vault (0.002 SOL in October 2026).
// The SOL fees are read as SOL transfers to the admin wallet inside FBYT transactions, labelled by the event of the
// transaction (TradingEvent: a swap, VaultCreatedEvent: a vault creation), so a change of the fee needs no change here.
// The management fee accrues as owed vault shares and is counted when it is paid out in tokens.

import ADDRESSES from "../../helpers/coreAssets.json";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";
import { METRIC } from "../../helpers/metrics";
import { assertComplete, programEventsSql, timeFilter, u64 } from "../../helpers/alliumSolanaEvents";
import { base58Encode, getAccountBuffer } from "../../helpers/solana";

const PROGRAM = "DNgg2FmwchUHYx2QiZ9pNJn1q5zypMprkSWFLUnNDigm";
const ADMIN_POOL = "8D4fE8ijbjTC1n5nA1Tmqzkm5CAjryBxbQwrkZ7A1kLE";
const ADMIN_POOL_ADMIN_OFFSET = 9; // AdminPool: 8 discriminator, bump u8, admin Pubkey
// AdminPool.admin, which receives every FBYT fee, and when it took over: the block time of its
// AdminPoolAcceptOwnershipEvent (old_admin, new_admin). A new admin needs an entry here; until then the adapter throws.
const ADMINS = [
  { wallet: "7Ru9yr97nYKaQLUV7YGRczujK3963xw1Dvwx5Emb7gt2", from: 0 },
  // 5J9SwynRipUDZY8YnyscUkvVrWuh53cuV1aiMP6ncFbbjGKVuJ78dWBqF5DB25sCoqRmUa6Yq6jtGcFMGsRpt391
  { wallet: "HGzLyNhNq8TFmizFgnLppXXKhzc8ph3vaWzP56f7cdMz", from: 1781466278 }, // 2026-06-14T19:44:38Z
  // 2awiGFcWZGi3tkA6om9ZD23wdpQpWmYYF8uNa8LWi9UUqLsxowvNRCqPWBp9ipsq6oYG7MY9zqomDTU1kHTkNxaQ
  { wallet: "2NeSaTMLtNernHGkzafpni5Gvd1tZPzugcAED1xXibr1", from: 1782883888 }, // 2026-07-01T05:31:28Z
  // 2ZaF3rqSKuNDRos4199KgnBccr2jdwWarySxRT4dqd1e69ThJnYzQucXbMdaPGw8UTdo6LhR7N9aNBsvEY7gWUnP
  { wallet: "FWK5K9x7YCDRGj24LdUR3DZBnfFBeT8Tfp9XX6YB3UaL", from: 1787063324 }, // 2026-08-18T14:28:44Z
  // 3PpbxXDQ8GajBz3ka2ASDTLHPTTW7ER3qQAxcGrLMgodBJZxErcVgoHRhfmApZjC5651XG4QJFZWYA1MqD54sNjD
  { wallet: "CVXeywor3pvqLq6vRwcWNdCmejouSHnXjCp1Tpn3WMzM", from: 1789653686 }, // 2026-09-17T14:01:26Z
];

// the admins in office at some point of [start, end)
const adminsDuring = (start: number, end: number) =>
  ADMINS.filter((admin, i) => admin.from < end && (ADMINS[i + 1]?.from ?? Infinity) > start).map((admin) => admin.wallet);

// sha256("event:<Name>")[0..8], and the sizes each event has had (discriminator included)
const EVENT = {
  WithdrawTokenFund: { discriminator: "7B1E7F0EB6088684", sizes: [180, 189] },
  WithdrawFeeSplit: { discriminator: "53F09B0B2BD615F5", sizes: [136] },
  WithdrawMoneyManagementFee: { discriminator: "36B24572FAF3A5C4", sizes: [120, 128] },
  VaultCreated: { discriminator: "5150F43A8836EC6F" },
  Trading: { discriminator: "1D7A2BE3BB3083BE" },
};

const LABELS = {
  VAULT_CREATION_FEES: "Vault Creation Fees",
  MANAGEMENT_TO_FBYT: "Management Fees To FBYT",
  PERFORMANCE_TO_FBYT: "Performance Fees To FBYT",
  TRADING_TO_FBYT: "Trading Fees To FBYT",
  VAULT_CREATION_TO_FBYT: "Vault Creation Fees To FBYT",
  MANAGEMENT_TO_MANAGERS: "Management Fees To Managers",
  PERFORMANCE_TO_MANAGERS: "Performance Fees To Managers",
};

const mintHex = (offset: number) => `SUBSTR(data, ${2 * offset + 1}, 64)`;
const ofEvent = (event: { discriminator: string }) => `FROM program_events WHERE STARTSWITH(data, '${event.discriminator}')`;
const txsWith = (event: { discriminator: string }) => `SELECT txn_id ${ofEvent(event)}`;

const fetch = async (options: FetchOptions) => {
  // the SOL fees are matched by the admin wallet: one missing from ADMINS would silently drop them
  const adminPool = await getAccountBuffer({ account: ADMIN_POOL });
  if (!adminPool) throw new Error(`fbyt: AdminPool ${ADMIN_POOL} not found`);
  const admin = base58Encode(adminPool.subarray(ADMIN_POOL_ADMIN_OFFSET, ADMIN_POOL_ADMIN_OFFSET + 32));
  if (admin !== ADMINS[ADMINS.length - 1].wallet)
    throw new Error(`fbyt: the AdminPool admin is now ${admin}, add it to ADMINS with the time it took over`);

  const knownSize = (event: { discriminator: string; sizes: number[] }) =>
    `SELECT COUNT(*) ${ofEvent(event)} AND LENGTH(data) NOT IN (${event.sizes.map((size) => 2 * size).join(", ")})`;

  const rows = await queryAllium(`${programEventsSql(PROGRAM, options)},
  withdrawals AS (
    SELECT txn_id, ${mintHex(104)} AS mint_hex, ${u64("data", 156)} AS manager_management, ${u64("data", 164)} AS manager_performance,
      ${u64("data", 172)} AS protocol
    ${ofEvent(EVENT.WithdrawTokenFund)}
  ),
  unsplit AS (
    -- withdrawals from before WithdrawFeeSplitEvent: FBYT's part is the share of the one fee charged
    SELECT * FROM withdrawals WHERE txn_id NOT IN (${txsWith(EVENT.WithdrawFeeSplit)})
  ),
  token_fees AS (
    SELECT ${mintHex(72)} AS mint_hex, ${u64("data", 104)} AS manager_management, ${u64("data", 112)} AS manager_performance,
      ${u64("data", 120)} AS protocol_management, ${u64("data", 128)} AS protocol_performance
    ${ofEvent(EVENT.WithdrawFeeSplit)}
    UNION ALL
    SELECT mint_hex, manager_management, manager_performance,
      IFF(manager_performance = 0, protocol, 0), IFF(manager_performance > 0 AND manager_management = 0, protocol, 0)
    FROM unsplit
    UNION ALL
    SELECT ${mintHex(72)}, ${u64("data", 104)}, 0, ${u64("data", 112)}, 0
    ${ofEvent(EVENT.WithdrawMoneyManagementFee)}
  ),
  fees AS (
    SELECT mint_hex, SUM(manager_management)::VARCHAR AS manager_management, SUM(manager_performance)::VARCHAR AS manager_performance,
      SUM(protocol_management)::VARCHAR AS protocol_management, SUM(protocol_performance)::VARCHAR AS protocol_performance
    FROM token_fees
    GROUP BY 1
  ),
  sol_fees AS (
    SELECT
      CASE
        WHEN txn_id IN (${txsWith(EVENT.VaultCreated)}) THEN 'creation'
        WHEN txn_id IN (${txsWith(EVENT.Trading)}) THEN 'trading'
        ELSE 'other'
      END AS kind,
      raw_amount
    FROM solana.assets.transfers
    WHERE ${timeFilter(options)} AND transfer_type = 'sol_transfer' AND type = 'transfer'
      AND to_address IN (${adminsDuring(options.startTimestamp, options.endTimestamp).map((wallet) => `'${wallet}'`).join(", ")})
      AND txn_id IN (SELECT txn_id FROM program_txs)
  )
  SELECT checks.*,
    -- an event with a size it never had: its layout changed and the offsets above may no longer hold
    (${knownSize(EVENT.WithdrawTokenFund)}) + (${knownSize(EVENT.WithdrawFeeSplit)}) + (${knownSize(EVENT.WithdrawMoneyManagementFee)}) AS unknown_layouts,
    (SELECT COUNT(*) FROM unsplit WHERE manager_management > 0 AND manager_performance > 0 AND protocol > 0) AS unsplit_both,
    (SELECT SUM(raw_amount) FROM sol_fees WHERE kind = 'creation')::VARCHAR AS creation_lamports,
    (SELECT SUM(raw_amount) FROM sol_fees WHERE kind = 'trading')::VARCHAR AS trading_lamports,
    (SELECT COUNT(*) FROM sol_fees WHERE kind = 'other') AS other_sol_transfers,
    fees.mint_hex, fees.manager_management, fees.manager_performance, fees.protocol_management, fees.protocol_performance
  FROM checks
  LEFT JOIN fees ON TRUE`);
  assertComplete(rows[0], "fbyt", options);
  const [check] = rows;
  if (Number(check.unknown_layouts) > 0)
    throw new Error(`fbyt: ${check.unknown_layouts} fee events with an unexpected size, their layout changed`);
  if (Number(check.unsplit_both) > 0)
    throw new Error(`fbyt: ${check.unsplit_both} withdrawals charged both fees without a WithdrawFeeSplitEvent, FBYT's part cannot be split`);
  if (Number(check.other_sol_transfers) > 0)
    throw new Error(`fbyt: ${check.other_sol_transfers} SOL transfers to the admin wallet in FBYT transactions that are neither a swap nor a vault creation`);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // a sum over no rows is absent from the response
  if (check.creation_lamports) {
    dailyFees.add(ADDRESSES.solana.SOL, check.creation_lamports, LABELS.VAULT_CREATION_FEES);
    dailyRevenue.add(ADDRESSES.solana.SOL, check.creation_lamports, LABELS.VAULT_CREATION_TO_FBYT);
  }
  if (check.trading_lamports) {
    dailyFees.add(ADDRESSES.solana.SOL, check.trading_lamports, METRIC.TRADING_FEES);
    dailyRevenue.add(ADDRESSES.solana.SOL, check.trading_lamports, LABELS.TRADING_TO_FBYT);
  }

  for (const row of rows) {
    if (!row.mint_hex) continue; // no fee event in the window
    const mint = base58Encode(Buffer.from(row.mint_hex, "hex"));
    dailyFees.add(mint, row.manager_management, METRIC.MANAGEMENT_FEES);
    dailyFees.add(mint, row.protocol_management, METRIC.MANAGEMENT_FEES);
    dailyFees.add(mint, row.manager_performance, METRIC.PERFORMANCE_FEES);
    dailyFees.add(mint, row.protocol_performance, METRIC.PERFORMANCE_FEES);
    dailyRevenue.add(mint, row.protocol_management, LABELS.MANAGEMENT_TO_FBYT);
    dailyRevenue.add(mint, row.protocol_performance, LABELS.PERFORMANCE_TO_FBYT);
    dailySupplySideRevenue.add(mint, row.manager_management, LABELS.MANAGEMENT_TO_MANAGERS);
    dailySupplySideRevenue.add(mint, row.manager_performance, LABELS.PERFORMANCE_TO_MANAGERS);
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Management and performance fees paid by vault investors (the manager's and FBYT's parts), plus the SOL trading fee paid on every vault swap and the SOL fee paid to create a vault.",
  UserFees: "All fees: investors pay the management and performance fees, managers (or their trading delegates) pay the trading and vault creation fees.",
  Revenue: "FBYT's share of the management and performance fees, plus all trading and vault creation fees.",
  ProtocolRevenue: "FBYT's share of the management and performance fees, plus all trading and vault creation fees.",
  SupplySideRevenue: "The money managers' share of the management and performance fees.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.MANAGEMENT_FEES]: "Yearly management fee on the vault's assets, set per vault by its manager, paid in the vault's tokens when it is paid out to the manager.",
    [METRIC.PERFORMANCE_FEES]: "Fee on the investor's profit above their high-water mark, set per vault by its manager, charged when the investor withdraws.",
    [METRIC.TRADING_FEES]: "SOL fee paid by the trade's signer on every vault swap: 0.001 SOL per swap until 2026-10-01, then a tiered % of the trade's USD value.",
    [LABELS.VAULT_CREATION_FEES]: "SOL fee paid by the money manager to create a vault (0.002 SOL).",
  },
  UserFees: {
    [METRIC.MANAGEMENT_FEES]: "Paid by vault investors.",
    [METRIC.PERFORMANCE_FEES]: "Paid by vault investors.",
    [METRIC.TRADING_FEES]: "Paid by the money manager or their trading delegate.",
    [LABELS.VAULT_CREATION_FEES]: "Paid by the money manager.",
  },
  Revenue: {
    [LABELS.MANAGEMENT_TO_FBYT]: "FBYT's protocol share of the management fee (20%).",
    [LABELS.PERFORMANCE_TO_FBYT]: "FBYT's protocol share of the performance fee (20%).",
    [LABELS.TRADING_TO_FBYT]: "All trading fees.",
    [LABELS.VAULT_CREATION_TO_FBYT]: "All vault creation fees.",
  },
  ProtocolRevenue: {
    [LABELS.MANAGEMENT_TO_FBYT]: "FBYT's protocol share of the management fee, sent to the FBYT admin wallet.",
    [LABELS.PERFORMANCE_TO_FBYT]: "FBYT's protocol share of the performance fee, sent to the FBYT admin wallet.",
    [LABELS.TRADING_TO_FBYT]: "All trading fees, sent to the FBYT admin wallet.",
    [LABELS.VAULT_CREATION_TO_FBYT]: "All vault creation fees, sent to the FBYT admin wallet.",
  },
  SupplySideRevenue: {
    [LABELS.MANAGEMENT_TO_MANAGERS]: "The money manager's share of the management fee (80%).",
    [LABELS.PERFORMANCE_TO_MANAGERS]: "The money manager's share of the performance fee (80%).",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-04-11",
  dependencies: [Dependencies.ALLIUM],
  methodology,
  breakdownMethodology,
};

export default adapter;
