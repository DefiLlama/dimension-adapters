import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";

// Gate is the SynFutures V3 entry point on Base. It exposes
// `getAllInstruments() returns (address[])` which enumerates every deployed
// Instrument contract; new markets show up here automatically, so the adapter
// is forward-compatible with future SynFutures listings without manual config.
// Docs: https://docs.synfutures.com/protocol/smart-contract-addresses/base-network
const GATE = "0x208B443983D8BcC8578e9D86Db23FbA547071270";

// Each Instrument contract emits exactly one Trade event per taker fill. The
// `entryNotional` field is the position's notional value in the quote token,
// scaled internally to 18 decimals regardless of the quote token's native
// decimals — so `entryNotional / 1e18` is the trade's USD-equivalent notional
// directly. Verified against the subgraph: a full 65-instrument sweep over
// 24h on 2026-05-20 sums to $65.49M, matching the v3-base subgraph's $64.6M
// for the same window within ~1%.
const TRADE_EVENT_ABI =
  "event Trade(uint32 indexed expiry, address indexed trader, int256 size, " +
  "uint256 amount, int256 takenSize, uint256 takenValue, uint256 entryNotional, " +
  "uint16 feeRatio, uint160 sqrtPX96, uint256 mark)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const instruments: string[] = await options.api.call({
    target: GATE,
    abi: "function getAllInstruments() view returns (address[])",
  });

  const logs = await options.getLogs({
    targets: instruments,
    eventAbi: TRADE_EVENT_ABI,
    flatten: true,
  });

  for (const log of logs) {
    dailyVolume.addUSDValue(Number(log.entryNotional) / 1e18);
  }

  return { dailyVolume };
};

const methodology = {
  Volume:
    "Taker-side notional volume summed from the on-chain `Trade(... uint256 " +
    "entryNotional ...)` event that every SynFutures V3 Instrument contract " +
    "emits once per fill. The full list of Instrument addresses is enumerated " +
    "per-fetch via `Gate.getAllInstruments()` (no hard-coded contract list, so " +
    "new markets are picked up automatically). The protocol scales " +
    "`entryNotional` internally to 18 decimals regardless of the quote token's " +
    "native decimals, so `entryNotional / 1e18` is the trade's USD-equivalent " +
    "notional directly. Replaces the previous subgraph-based query for a " +
    "trustless data source.",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.BASE],
  start: "2024-06-26",
  pullHourly: true,
  methodology,
};

export default adapter;
