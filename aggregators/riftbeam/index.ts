import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";

// Marker program included in RiftBeam-routed swap txs (empty invoke + "RiftBeam" memo).
// The swap itself is executed via Jupiter (and historically other AMMs).
const RIFTBEAM_PROGRAM = "DYR2SfXreL4wMPKjWzgWv17r7qHJk3kyp1R7k3MsKkEV";

const fetch = async (options: FetchOptions) => {
  const start = options.startTimestamp;
  const end = options.endTimestamp;
  const query = `
    WITH rift_txs AS (
      SELECT DISTINCT txn_id
      FROM solana.raw.instructions
      WHERE program_id = '${RIFTBEAM_PROGRAM}'
        AND block_timestamp >= TO_TIMESTAMP_NTZ(${start})
        AND block_timestamp < TO_TIMESTAMP_NTZ(${end})
    ),
    hop_dedup AS (
      SELECT t.usd_amount
      FROM solana.dex.trades t
      INNER JOIN rift_txs r ON t.txn_id = r.txn_id
      WHERE t.block_timestamp >= TO_TIMESTAMP_NTZ(${start})
        AND t.block_timestamp < TO_TIMESTAMP_NTZ(${end})
      QUALIFY ROW_NUMBER() OVER (
        PARTITION BY t.txn_id, t.instruction_index
        ORDER BY t.usd_amount DESC
      ) = 1
    )
    SELECT COALESCE(SUM(usd_amount), 0) AS volume
    FROM hop_dedup
  `;

  const data = await queryAllium(query);
  return {
    dailyVolume: data[0]?.volume ?? 0,
  };
};

const methodology = {
  Volume:
    "USD notional of swaps in successful Solana transactions that invoke the RiftBeam marker program (DYR2SfXreL4wMPKjWzgWv17r7qHJk3kyp1R7k3MsKkEV). Sourced from Allium solana.dex.trades, counting each outer instruction once (largest hop USD) so multi-hop Jupiter routes are not double-counted.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  start: "2026-08-16",
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology,
};

export default adapter;
