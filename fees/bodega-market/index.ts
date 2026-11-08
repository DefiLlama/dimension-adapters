import * as sdk from "@defillama/sdk";
import PromisePool from "@supercharge/promise-pool";
import { Adapter, FetchOptions, FetchResult } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { decodePlutusData } from "../../helpers/cardano";

const cardano = sdk.chains.cardano;

// Market creators also pay an open fee (2 ADA in each protocol settings datum) to the treasury script address that
// carries the protocol stake key. That address is never spent from.
const PREDICTION_NFT_NAME = '50524f4a4543545f50524544494354494f4e5f4e4654'; // PROJECT_PREDICTION_NFT
const INFO_NFT_NAME = '50524f4a4543545f494e464f5f4e4654'; // PROJECT_INFO_NFT

const DEPLOYMENTS = [
  {
    // V2 (beta.bodegamarket.io), first market 2025-03-31 (tx f55be18ba6c2...). Settings NFT a8921d89..., treasury script 340906df...
    prediction: 'addr1x99yh3eglqg320ee4yeefvafc7h9fk7khk8xwp5hqcq524l5rawx2k37hx9mjk6pr0n0fg4rp7sswpv7pywfpvvuj6ksj58rfr',
    authPolicy: 'a7ccddea1b637c84c09a27b15dd8ab0b34eb8f5ab55d05e947a21a5d',
    openFeeTreasury: 'addr1xy6qjpklhhaam9zcuc4l8vda36d8wdcyhgut53ws30pu7r05rawx2k37hx9mjk6pr0n0fg4rp7sswpv7pywfpvvuj6ksqnay3u',
    from: 1743379200, // 2025-03-31
  },
  {
    // V3 protocol config 0, first market 2025-07-22 (tx ace3984dfafc...), markets closed out 2026-08-15. Settings NFT
    // d2e8f0ba..., treasury script c7c7af0f...
    prediction: 'addr1xx25vyyteavkeddsueufzr4ahgsa987fafvhv032tnmvg0dgl7dv5f8n43cyguzxv2xu3vnqdynvj5nxu2yere25k4kqf0df9x',
    authPolicy: '08a8c0fbe85823132cb14a3767d2e114c8c85f58153b072f8c9e3633',
    openFeeTreasury: 'addr1x8ru0tc0tsy23wfe34u02zazflmkat2ar8rzk8qf93f5r94gl7dv5f8n43cyguzxv2xu3vnqdynvj5nxu2yere25k4kqpuwsp0',
    from: 1753142400, // 2025-07-22
  },
  {
    // V3 protocol config 1 (v3.bodegamarket.io), first market 2026-08-18 (tx 0689ed40ecc6...). Settings NFT
    // f81dd8dc..., treasury script 2c51f10a...
    prediction: 'addr1x9s6vvzx76v8g4xmlk28wlgutya4surfckfzlhyk9lf2jr9gl7dv5f8n43cyguzxv2xu3vnqdynvj5nxu2yere25k4kqntyswm',
    authPolicy: 'cca8aa92d4d48d49f4b0e479320389c8315bbeafcd835965a479a74a',
    openFeeTreasury: 'addr1xyk9rug2k4msvwexuuzfwfgruzhaghr7ndyaza97sv3zey4gl7dv5f8n43cyguzxv2xu3vnqdynvj5nxu2yere25k4kqnueqey',
    from: 1787011200, // 2026-08-18
  },
];

// Withdrawn admin fees are split by share_ratio 5000 (base 10000) in the protocol settings datums: half to the
// market creator, half to Bodega. On-chain treasury sweeps pay the two halves to the creator and to Bodega's fee
// wallet (V2 sweep b16d1c330115..., V3 sweep 0385150c919e...).
const CREATOR_SHARE = 0.5;
// Bodega's half went 25% of fees to BODEGA stakers and 25% to the team until 2025-06-12, then all of it to stakers:
// https://x.com/BodegaCardano/status/1933108655903367626 and https://x.com/BodegaCardano/status/1933113161244389720
const STAKERS_ONLY_FROM = 1749686400; // 2025-06-12

const LABELS = {
  MARKET_CREATION_FEES: 'Market Creation Fees',
  TRADING_FEES_TO_CREATORS: 'Trading Fees To Market Creators',
  TRADING_FEES_TO_PROTOCOL: 'Trading Fees To Protocol',
  TRADING_FEES_TO_STAKERS: 'Trading Fees To BODEGA Stakers',
  TRADING_FEES_TO_TEAM: 'Trading Fees To Team',
};

type Utxo = { address: string; amount: { unit: string; quantity: string }[]; inline_datum: string | null };

const datumFields = (utxo: Utxo): any[] => {
  if (!utxo.inline_datum) throw new Error(`Bodega UTxO at ${utxo.address} has no inline datum`);
  const datum = decodePlutusData(utxo.inline_datum) as any;
  if (!Array.isArray(datum?.fields)) throw new Error(`Bodega UTxO at ${utxo.address} has an unexpected datum`);
  return datum.fields;
};
// The first datum field of the project info and prediction UTxOs is the market's seed outref.
const marketKey = (fields: any[]) => `${fields[0].fields[0]}#${fields[0].fields[1]}`;
const holds = (utxo: Utxo, unit: string) => utxo.amount.some((a) => a.unit === unit);

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const { startTimestamp, endTimestamp } = options;
  const tradingFees: Record<string, bigint> = {};
  let openFeesLovelace = 0n;

  const deployments = DEPLOYMENTS.filter((d) => d.from < endTimestamp);
  if (deployments.length) {
    const [fromBlock, toBlock] = await Promise.all([
      cardano.getBlockAtTimestamp({ timestamp: startTimestamp }),
      cardano.getBlockAtTimestamp({ timestamp: endTimestamp }),
    ]);
    for (const d of deployments) {
      const txs = (await cardano.getAddressTransactions({ address: d.prediction, from: fromBlock.number, to: toBlock.number }))
        .filter((tx) => tx.block_time >= startTimestamp && tx.block_time < endTimestamp);
      const { results, errors } = await PromisePool.withConcurrency(5)
        .for(txs)
        .process((tx) => cardano.getTxUtxos({ txHash: tx.tx_hash }));
      if (errors.length) throw errors[0];

      const predictionUnit = d.authPolicy + PREDICTION_NFT_NAME;
      const infoUnit = d.authPolicy + INFO_NFT_NAME;
      for (const tx of results) {
        const inputs = tx.inputs.filter((i) => !i.collateral);
        const outputs = tx.outputs.filter((o) => !o.collateral);

        // payment token per market, from the project info datum (payment_policy_id, payment_token_name). Closed V2
        // markets hand the info NFT back to the creator's wallet without a datum, so only datum-carrying UTxOs count.
        const paymentUnit: Record<string, string> = {};
        for (const utxo of [...inputs, ...outputs]) {
          if (!holds(utxo, infoUnit) || !utxo.inline_datum) continue;
          const fields = datumFields(utxo);
          paymentUnit[marketKey(fields)] = fields[5] === '' ? 'lovelace' : `${fields[5]}${fields[6]}`;
        }

        const feeBefore: Record<string, bigint> = {};
        for (const utxo of inputs) {
          if (utxo.reference || utxo.address !== d.prediction || !holds(utxo, predictionUnit)) continue;
          const fields = datumFields(utxo);
          feeBefore[marketKey(fields)] = fields[1];
        }
        for (const utxo of outputs) {
          if (utxo.address !== d.prediction || !holds(utxo, predictionUnit)) continue;
          const fields = datumFields(utxo);
          const key = marketKey(fields);
          if (feeBefore[key] === undefined) continue; // market creation, total_fee starts at 0
          const fee: bigint = fields[1] - feeBefore[key];
          if (fee <= 0n) continue; // WithdrawFee resets total_fee to 0 when it moves the fee to the treasury
          const unit = paymentUnit[key];
          if (!unit) throw new Error(`Bodega tx ${tx.hash}: no project info datum for market ${key}`);
          tradingFees[unit] = (tradingFees[unit] ?? 0n) + fee;
        }

        for (const utxo of outputs)
          if (utxo.address === d.openFeeTreasury)
            openFeesLovelace += BigInt(utxo.amount.find((a) => a.unit === 'lovelace')?.quantity ?? 0);
      }
    }
  }

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  const stakersOnly = startTimestamp >= STAKERS_ONLY_FROM;
  for (const [unit, amount] of Object.entries(tradingFees)) {
    const add = (balances: sdk.Balances, share: number, label: string) => {
      if (unit === 'lovelace') balances.addCGToken('cardano', Number(amount) / 1e6 * share, label);
      else balances.add(unit, Number(amount) * share, label);
    };
    add(dailyFees, 1, METRIC.TRADING_FEES);
    add(dailySupplySideRevenue, CREATOR_SHARE, LABELS.TRADING_FEES_TO_CREATORS);
    add(dailyRevenue, 1 - CREATOR_SHARE, LABELS.TRADING_FEES_TO_PROTOCOL);
    if (stakersOnly) {
      add(dailyHoldersRevenue, 1 - CREATOR_SHARE, LABELS.TRADING_FEES_TO_STAKERS);
    } else {
      add(dailyHoldersRevenue, (1 - CREATOR_SHARE) / 2, LABELS.TRADING_FEES_TO_STAKERS);
      add(dailyProtocolRevenue, (1 - CREATOR_SHARE) / 2, LABELS.TRADING_FEES_TO_TEAM);
    }
  }

  const openFees = Number(openFeesLovelace) / 1e6;
  dailyFees.addCGToken('cardano', openFees, LABELS.MARKET_CREATION_FEES);
  dailyRevenue.addCGToken('cardano', openFees, LABELS.MARKET_CREATION_FEES);
  dailyProtocolRevenue.addCGToken('cardano', openFees, LABELS.MARKET_CREATION_FEES);

  return {
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
    dailyProtocolRevenue,
  };
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.CARDANO]: {
      fetch,
      start: '2025-03-31',
    },
  },
  methodology: {
    Fees: "Admin fees (2%) paid by users on prediction buys, sells, rewards and refunds, plus the 2 ADA fee paid to open a market. Covers the V2 and V3 contracts; the V1 contracts (before 2025-03-31) are not tracked.",
    UserFees: "Admin fees (2%) paid by users on prediction buys, sells, rewards and refunds, plus the 2 ADA fee paid to open a market.",
    Revenue: "Half of the admin fees, which Bodega keeps, plus the market opening fees held in the protocol treasury.",
    SupplySideRevenue: "Half of the admin fees, paid to the creator of each market.",
    HoldersRevenue: "Admin fees distributed to BODEGA stakers in ADA: 25% of admin fees until 2025-06-12, 50% since.",
    ProtocolRevenue: "Market opening fees held in the protocol treasury, plus 25% of admin fees kept by the team until 2025-06-12.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRADING_FEES]: "2% admin fee charged on prediction buys, sells, rewards and refunds, read from each market's on-chain fee counter.",
      [LABELS.MARKET_CREATION_FEES]: "2 ADA fee paid by the creator when opening a market.",
    },
    UserFees: {
      [METRIC.TRADING_FEES]: "2% admin fee charged on prediction buys, sells, rewards and refunds, read from each market's on-chain fee counter.",
      [LABELS.MARKET_CREATION_FEES]: "2 ADA fee paid by the creator when opening a market.",
    },
    Revenue: {
      [LABELS.TRADING_FEES_TO_PROTOCOL]: "Bodega's half of the admin fees.",
      [LABELS.MARKET_CREATION_FEES]: "Market opening fees held in the protocol treasury.",
    },
    SupplySideRevenue: {
      [LABELS.TRADING_FEES_TO_CREATORS]: "Half of the admin fees, paid to the market creator.",
    },
    HoldersRevenue: {
      [LABELS.TRADING_FEES_TO_STAKERS]: "Admin fees distributed to BODEGA stakers: 25% of admin fees until 2025-06-12, 50% since.",
    },
    ProtocolRevenue: {
      [LABELS.TRADING_FEES_TO_TEAM]: "25% of admin fees kept by the team until 2025-06-12.",
      [LABELS.MARKET_CREATION_FEES]: "Market opening fees held in the protocol treasury.",
    },
  },
};

export default adapter;
