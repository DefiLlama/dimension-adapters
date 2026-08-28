import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchEthereum } from "./ethereum";
import { fetchSui } from "./sui";

const methodology = {
  Volume:
    "Settled trade volume from on-chain HTLC events. Hashlock Markets is a cross-chain OTC venue: takers post sealed-bid RFQs, market makers respond, both sides lock funds in HTLCs (Hash Time-Locked Contracts) on their respective chains using a shared sha256 hash. When the taker reveals the preimage, both legs settle atomically; otherwise both refund after the timelock. " +
    "Each cross-chain trade emits one withdraw event per leg (one on each chain), but a trade is counted ONCE — on the source leg, defined as the chain where the taker deposits and the maker withdraws after preimage reveal. The source leg is identified deterministically as the leg with the longest timelock among all legs sharing the same hashlock; per the atomic-swap protocol, the source-leg timelock is always strictly greater than the destination-leg timelock to ensure preimage propagation safety. " +
    "Ethereum: source-leg HTLCETH_Withdraw and HTLCERC20_Withdraw amounts are read directly from the event. Sui: source-leg HTLCLocked amount is read from the lock event and attributed to lock day (Sui's HTLCClaimed event does not carry amount, so claim-day attribution is not possible; lock-day counting eliminates cross-midnight gaps). " +
    "Refunded HTLCs are excluded from volume on both chains. Full methodology: https://hashlock.markets/methodology",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
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
