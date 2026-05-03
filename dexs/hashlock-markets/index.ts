import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchEthereum } from "./ethereum";
import { fetchSui } from "./sui";

const methodology = {
  Volume:
    "Settled trade volume from on-chain HTLC withdraw events. Hashlock Markets is a cross-chain OTC venue: takers post sealed-bid RFQs, market makers respond, both sides lock funds in HTLCs (Hash Time-Locked Contracts) on their respective chains using a shared sha256 hash. When the taker reveals the preimage, both legs settle atomically; otherwise both refund after the timelock. " +
    "Per-chain dailyVolume = sum of HTLC withdraw notional on that chain in the day window. " +
    "Each cross-chain trade emits one withdraw event per leg (one per chain), so the protocol-level total is approximately 2x the unique-trade USD value. The `doublecounted: true` flag is set so DefiLlama can deduplicate at protocol level. " +
    "Ethereum: amount is read directly from the Withdraw event. Sui: amount is read from the corresponding HTLCLocked event (joined by htlc_id), counted only when the HTLC was claimed (not refunded). " +
    "Refunded HTLCs are excluded from volume on both chains. Full methodology: https://hashlock.markets/methodology",
};

const adapter: SimpleAdapter = {
  version: 2,
  doublecounted: true,
  methodology,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchEthereum,
      start: "2026-04-09",
    },
    [CHAIN.SUI]: {
      fetch: fetchSui,
      start: "2026-05-01",
    },
  },
};

export default adapter;
