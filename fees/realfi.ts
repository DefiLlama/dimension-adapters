import * as sdk from "@defillama/sdk";
import PromisePool from "@supercharge/promise-pool";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getAddressTransactionsBetween } from "../helpers/cardano";
import { METRIC } from "../helpers/metrics";

// https://docs.realfi.co/realfi-tokens/susdrf-staked-usdrf
const STAKING_VAULT = 'addr1wyh04daelcpkgahkuz2ld885w2y3wa27r7w82gzdeagsazgtwduhf';
// https://docs.realfi.co/realfi-tokens/in-summary
const USDRF = '7d9e4a0ee1a3f5d5ff8159ea91a83310cf2795ee7a87170c7aea05ae55534472';
const SUSDRF = '7d9e4a0ee1a3f5d5ff8159ea91a83310cf2795ee7a87170c7aea05ae7355534472';
const USDRF_DECIMALS = 1e6;

const LABELS = {
  YIELD_TO_STAKERS: 'Assets Yields To sUSDrf Stakers',
  YIELD_TO_PROTOCOL: 'Assets Yields To Protocol',
};

const sumAsset = (utxos: { amount: { unit: string; quantity: string }[] }[], unit: string) =>
  utxos.reduce((sum, utxo) => sum + BigInt(utxo.amount.find((a) => a.unit === unit)?.quantity ?? 0), 0n);

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const txs = await getAddressTransactionsBetween(STAKING_VAULT, options.startTimestamp, options.endTimestamp);
  const { results, errors } = await PromisePool.withConcurrency(5)
    .for(txs)
    .process((tx) => sdk.chains.cardano.getTxUtxos({ txHash: tx.tx_hash }));
  if (errors.length) throw errors[0];

  for (const tx of results) {
    const inputs = tx.inputs.filter((i) => !i.collateral && !i.reference);
    const outputs = tx.outputs.filter((o) => !o.collateral);
    const mintedUsdrf = sumAsset(outputs, USDRF) - sumAsset(inputs, USDRF);
    const mintedSusdrf = sumAsset(outputs, SUSDRF) - sumAsset(inputs, SUSDRF);
    const vaultDelta = sumAsset(outputs.filter((o) => o.address === STAKING_VAULT), USDRF)
      - sumAsset(inputs.filter((i) => i.address === STAKING_VAULT), USDRF);

    if (mintedSusdrf !== 0n) {
      if (mintedUsdrf !== 0n) throw new Error(`realfi: tx ${tx.hash} mints USDrf and sUSDrf together, cannot split yield from stake flows`);
      continue;
    }
    if (vaultDelta === 0n) continue;

    if (vaultDelta > 0n) {
      if (mintedUsdrf < vaultDelta) throw new Error(`realfi: tx ${tx.hash} adds ${vaultDelta} USDrf to the vault but mints only ${mintedUsdrf}`);
      const protocolShare = Number(mintedUsdrf - vaultDelta) / USDRF_DECIMALS;
      const stakersShare = Number(vaultDelta) / USDRF_DECIMALS;
      dailyFees.addUSDValue(stakersShare + protocolShare, METRIC.ASSETS_YIELDS);
      dailySupplySideRevenue.addUSDValue(stakersShare, LABELS.YIELD_TO_STAKERS);
      dailyRevenue.addUSDValue(protocolShare, LABELS.YIELD_TO_PROTOCOL);
    } else {
      if (mintedUsdrf !== vaultDelta) throw new Error(`realfi: tx ${tx.hash} removes ${-vaultDelta} USDrf from the vault but burns ${-mintedUsdrf}`);
      const loss = Number(vaultDelta) / USDRF_DECIMALS;
      dailyFees.addUSDValue(loss, METRIC.ASSETS_YIELDS);
      dailySupplySideRevenue.addUSDValue(loss, LABELS.YIELD_TO_STAKERS);
    }
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.CARDANO],
  start: '2026-06-17',
  pullHourly: true,
  // portfolio losses are realized by burning USDrf from the sUSDrf staking vault, which makes fees and supply side negative
  allowNegativeValue: true,
  methodology: {
    Fees: "Yield from RealFi's reserve portfolio (treasury bills, money market funds, CLO ETFs, floating-rate bonds and private credit), counted when it is minted on-chain as new USDrf at each weekly staking epoch, net of portfolio losses burned from the sUSDrf staking vault. Excludes income RealFi earns off-chain on unstaked USDrf reserves that is never minted on-chain. Mint and redeem fees are currently 0 bps.",
    Revenue: "Share of each epoch's minted yield sent to the RealFi protocol fee address instead of the sUSDrf staking vault.",
    ProtocolRevenue: "Share of each epoch's minted yield sent to the RealFi protocol fee address instead of the sUSDrf staking vault.",
    SupplySideRevenue: "Share of each epoch's minted yield added to the sUSDrf staking vault, which raises the USDrf redeemable per sUSDrf, net of portfolio losses burned from the vault.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.ASSETS_YIELDS]: "Reserve portfolio yield minted as new USDrf at each weekly staking epoch, net of losses burned from the sUSDrf staking vault.",
    },
    Revenue: {
      [LABELS.YIELD_TO_PROTOCOL]: "Part of the minted yield sent to the RealFi protocol fee address.",
    },
    ProtocolRevenue: {
      [LABELS.YIELD_TO_PROTOCOL]: "Part of the minted yield sent to the RealFi protocol fee address.",
    },
    SupplySideRevenue: {
      [LABELS.YIELD_TO_STAKERS]: "Part of the minted yield added to the sUSDrf staking vault, net of losses burned from the vault.",
    },
  },
};

export default adapter;
