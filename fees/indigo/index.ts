import axios from "axios";
import * as sdk from "@defillama/sdk";
import PromisePool from "@supercharge/promise-pool";
import { Balances } from "@defillama/sdk";
import { Adapter, FetchOptions, FetchResult } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { blockfrost } from "../../helpers/cardano";

const cardano = sdk.chains.cardano;

// Indigo V3 went live on 2026-05-28: the last V2 collector flow is at 11:34 UTC (slot 188401797) and the first
// V3 fee tx (e4686a7b3b0e...) is at 13:32 UTC. The V2 analytics endpoints below only index the V2 treasury and
// collector, so they return empty totals for every window after the cut-over.
const V3_START = 1779969600; // 2026-05-28 12:00:00 UTC

const ANALYTICS_API_ENDPOINT = 'https://analytics.indigoprotocol.io';

// V3 treasury: validatorHashes.treasuryHash 46ffe1d1... with treasuryParams.treasuryUtxosStakeCredential b8358aad...
// from https://config.indigoprotocol.io/mainnet/mainnet-system-params-v3.json. Unchanged by the 2026-10-19 upgrade.
const TREASURY = 'addr1x9r0lcw3vth4c8zdfs9e966pp6q533vu23u496av893z40dcxk92m5cvvr46z6rq3t27sa2e96dhewx8qzp8eh58lx3sr8aa7r';

// CDP interest is minted as iAssets into interest-collection UTxOs. The script moves on contract upgrades, together
// with the INTEREST_ADMIN NFT that marks the current one.
const INTEREST_ADMIN_NFT = '47fa499d17c414c9a1a2246960827ef5085aabf7d558715474622d36494e5445524553545f41444d494e';
const INTEREST_COLLECTORS = [
  // validatorHashes.interestCollectionHash 2cac220a... in the V3 system params
  { address: 'addr1wyk2cgs20z5fg0k3x2ev623y7tfxaq9a6e4t2n2829llcpq5ua6p2', from: V3_START, to: 1792454400 },
  // script eeea2dd2...: the 2026-10-19 upgrade moved the accrued interest (16:11-17:25 UTC) and the admin NFT
  // (tx f9ceb5924eb9...) here
  { address: 'addr1w8hw5twjee0a32vp0s7s8fqsvafu6x7uvxryhlr2hz74z8s8drpez', from: 1792368000 },
];

const LABELS = {
  V3_CDP_FEES: 'CDP And Stableswap Fees',
  V3_CDP_FEES_TO_TREASURY: 'CDP And Stableswap Fees To Treasury',
  INTEREST_TO_PROTOCOL: 'Borrow Interest To Protocol',
  V2_CDP_FEES: 'V2 CDP Fees',
  V2_CDP_FEES_TO_TREASURY: 'V2 CDP Fees To Treasury',
  V2_CDP_FEES_TO_STAKERS: 'V2 CDP Fees To INDY Stakers',
};

type Totals = Record<string, string | number | bigint>;

const fetchRevenueTotals = async (endpoint: string, from: number, to: number): Promise<Totals> => {
  const url = `${ANALYTICS_API_ENDPOINT}/api/revenue/${endpoint}?totals&inflows_only&from=${from}&to=${to}`;
  const { data } = await axios.get(url);
  // The API serialises an empty totals map as []. It is only queried for windows before V3_START, where the V2
  // contracts were live and indexed, so [] there is a window without flows, not a broken response.
  if (Array.isArray(data?.totals) && data.totals.length === 0) return {};
  if (!data || typeof data.totals !== 'object' || data.totals === null || Array.isArray(data.totals)) {
    throw new Error(`Indigo ${endpoint} returned an unexpected response: ${JSON.stringify(data)?.slice(0, 200)}`);
  }
  return data.totals;
};

const addTotals = (balances: Balances, totals: Totals, label: string) => {
  for (const [unit, amount] of Object.entries(totals)) {
    if (!Number(amount)) continue;
    if (unit === 'lovelace') {
      balances.addCGToken('cardano', Number(amount) / 1_000_000, label);
    } else {
      balances.add(unit, amount.toString(), label);
    }
  }
};

// Net assets added to `address` by txs in [start, end) that spend one of its UTxOs. Indigo pays fees by spending a
// treasury / interest-collection UTxO and recreating it with the fee added (treasury Collect and CollectInterest
// redeemers). Outputs created without spending one are donations, Minswap fee-sharing withdrawals ("Minswap:
// Withdraw fee sharing" metadata) or contract-upgrade migrations, not fees paid by Indigo users. Txs that take
// assets out (treasury spends, interest distribution) net negative and are skipped per asset.
const getFeeInflows = async (address: string, fromBlock: number, toBlock: number, start: number, end: number) => {
  const txs = (await cardano.getAddressTransactions({ address, from: fromBlock, to: toBlock }))
    .filter((tx) => tx.block_time >= start && tx.block_time < end);
  const { results, errors } = await PromisePool.withConcurrency(5)
    .for(txs)
    .process((tx) => cardano.getTxUtxos({ txHash: tx.tx_hash }));
  if (errors.length) throw errors[0];

  const inflows: Record<string, bigint> = {};
  for (const tx of results) {
    const spent = tx.inputs.filter((i) => !i.reference && !i.collateral && i.address === address);
    if (!spent.length) continue;
    const net: Record<string, bigint> = {};
    for (const input of spent)
      for (const { unit, quantity } of input.amount) net[unit] = (net[unit] ?? 0n) - BigInt(quantity);
    for (const output of tx.outputs) {
      if (output.collateral || output.address !== address) continue;
      for (const { unit, quantity } of output.amount) net[unit] = (net[unit] ?? 0n) + BigInt(quantity);
    }
    for (const [unit, amount] of Object.entries(net))
      if (amount > 0n) inflows[unit] = (inflows[unit] ?? 0n) + amount;
  }
  return inflows;
};

const addV2Fees = async (start: number, end: number, balances: Record<string, Balances>) => {
  // Collector Flows are all fees that are sent to INDY stakers:
  // CDP Mint Fees, (partially) CDP Interest Payments, and Redemption Fees.
  const collectorTotals = await fetchRevenueTotals('collector-flows', start, end);
  // Treasury captures the following assets: ADA, INDY, iUSD, iBTC, iETH, and iSOL.
  // This collects: CDP Interest Payments (to treasury), INDY returned from emissions, and buybacks.
  const treasuryTotals = await fetchRevenueTotals('flows', start, end);

  addTotals(balances.dailyFees, treasuryTotals, LABELS.V2_CDP_FEES);
  addTotals(balances.dailyFees, collectorTotals, LABELS.V2_CDP_FEES);
  addTotals(balances.dailyRevenue, treasuryTotals, LABELS.V2_CDP_FEES_TO_TREASURY);
  addTotals(balances.dailyRevenue, collectorTotals, LABELS.V2_CDP_FEES_TO_STAKERS);
  addTotals(balances.dailyProtocolRevenue, treasuryTotals, LABELS.V2_CDP_FEES_TO_TREASURY);
  addTotals(balances.dailyHoldersRevenue, collectorTotals, LABELS.V2_CDP_FEES_TO_STAKERS);
};

const addV3Fees = async (start: number, end: number, balances: Record<string, Balances>) => {
  // A collector the adapter does not know means an upgrade moved the interest: fail instead of dropping it.
  const holders: { address: string }[] = await blockfrost(`/assets/${INTEREST_ADMIN_NFT}/addresses`);
  const current = INTEREST_COLLECTORS[INTEREST_COLLECTORS.length - 1].address;
  if (holders.length !== 1 || holders[0].address !== current)
    throw new Error(`Indigo INTEREST_ADMIN NFT moved to ${holders.map((h) => h.address).join(',')}, add the new interest collector`);

  const [fromBlock, toBlock] = await Promise.all([
    cardano.getBlockAtTimestamp({ timestamp: start }),
    cardano.getBlockAtTimestamp({ timestamp: end }),
  ]);
  const collectors = INTEREST_COLLECTORS.filter((c) => c.from < end && (c.to === undefined || c.to > start));

  const treasuryInflows = await getFeeInflows(TREASURY, fromBlock.number, toBlock.number, start, end);
  addTotals(balances.dailyFees, treasuryInflows, LABELS.V3_CDP_FEES);
  addTotals(balances.dailyRevenue, treasuryInflows, LABELS.V3_CDP_FEES_TO_TREASURY);
  addTotals(balances.dailyProtocolRevenue, treasuryInflows, LABELS.V3_CDP_FEES_TO_TREASURY);

  for (const { address } of collectors) {
    const interest = await getFeeInflows(address, fromBlock.number, toBlock.number, start, end);
    addTotals(balances.dailyFees, interest, METRIC.BORROW_INTEREST);
    addTotals(balances.dailyRevenue, interest, LABELS.INTEREST_TO_PROTOCOL);
    addTotals(balances.dailyProtocolRevenue, interest, LABELS.INTEREST_TO_PROTOCOL);
  }
};

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  // Liquidations are intentionally NOT counted as fees: when a CDP is liquidated, its ADA
  // collateral is distributed to Stability Pool depositors (who burn their iAssets to cover
  // the debt). That collateral is the protocol's own TVL passing to other users, not a fee
  // paid to the protocol, so including it overstates fees. Only the liquidation processing fee
  // paid into the V3 treasury is counted.
  const { startTimestamp, endTimestamp } = options;
  const balances = {
    dailyFees: options.createBalances(),
    dailyRevenue: options.createBalances(),
    dailyProtocolRevenue: options.createBalances(),
    dailyHoldersRevenue: options.createBalances(),
  };

  if (startTimestamp < V3_START) await addV2Fees(startTimestamp, Math.min(endTimestamp, V3_START), balances);
  if (endTimestamp > V3_START) await addV3Fees(Math.max(startTimestamp, V3_START), endTimestamp, balances);

  // V3 sends no fees to the INDY staker collector. The interest admin sweeps the interest collector about monthly
  // to a key wallet (e.g. 038611e572c0... on 2026-08-03), which forwards roughly half to the treasury (e5ae4d5d2d31...)
  // without spending a treasury UTxO, so it is not counted twice. Staker rewards and INDY buybacks paid from the
  // rest are not traced, so holders revenue is only reported for V2.
  const { dailyHoldersRevenue, ...v3Balances } = balances;
  return startTimestamp < V3_START ? balances : v3Balances;
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.CARDANO]: {
      fetch,
      start: '2022-11-22',
    },
  },
  methodology: {
    Fees: "CDP fees paid by users. Since Indigo V3 (May 28, 2026): borrow interest added to the interest-collection contract, plus debt minting, redemption, liquidation processing and stableswap fees paid into the treasury. Before V3: inflows to the V2 treasury and INDY staker collector reported by Indigo's analytics API. Excludes liquidated collateral, which goes to Stability Pool depositors, and Minswap fee-sharing income.",
    Revenue: "All CDP fees paid by users, which the protocol keeps in its treasury and interest-collection contract (or, before V3, sent to INDY stakers).",
    ProtocolRevenue: "CDP fees paid into the Indigo treasury and, since V3, borrow interest held in the protocol's interest-collection contract.",
    HoldersRevenue: "Before Indigo V3, CDP fees sent to the INDY staker collector. V3 sends no fees to stakers directly.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.BORROW_INTEREST]: "Interest paid by CDP borrowers, minted as iAssets into Indigo's interest-collection contract (since V3).",
      [LABELS.V3_CDP_FEES]: "Debt minting fees, redemption processing fees, liquidation processing fees and stableswap fees paid into the Indigo treasury (since V3).",
      [LABELS.V2_CDP_FEES]: "Inflows to the V2 treasury and INDY staker collector from Indigo's analytics API (before V3): mint fees, interest payments, redemption fees and other treasury inflows.",
    },
    Revenue: {
      [LABELS.INTEREST_TO_PROTOCOL]: "Borrow interest kept in Indigo's interest-collection contract (since V3).",
      [LABELS.V3_CDP_FEES_TO_TREASURY]: "Minting, redemption, liquidation processing and stableswap fees kept by the Indigo treasury (since V3).",
      [LABELS.V2_CDP_FEES_TO_TREASURY]: "V2 fees and other inflows sent to the Indigo treasury (before V3).",
      [LABELS.V2_CDP_FEES_TO_STAKERS]: "V2 mint fees, redemption fees and part of the interest sent to the INDY staker collector (before V3).",
    },
    ProtocolRevenue: {
      [LABELS.INTEREST_TO_PROTOCOL]: "Borrow interest kept in Indigo's interest-collection contract (since V3).",
      [LABELS.V3_CDP_FEES_TO_TREASURY]: "Minting, redemption, liquidation processing and stableswap fees kept by the Indigo treasury (since V3).",
      [LABELS.V2_CDP_FEES_TO_TREASURY]: "V2 fees and other inflows sent to the Indigo treasury (before V3).",
    },
    HoldersRevenue: {
      [LABELS.V2_CDP_FEES_TO_STAKERS]: "V2 mint fees, redemption fees and part of the interest sent to the INDY staker collector (before V3).",
    },
  },
};

export default adapter;
