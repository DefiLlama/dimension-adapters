import { Dependencies, FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { getVersionFromTimestamp, view } from "../../helpers/aptos";

// api.cellana.finance is NXDOMAIN and the cellana.finance apex resolves with no A record, so the
// dapp endpoint this adapter read is gone along with the site. The pools are still trading, mostly
// routed in by aggregators, so volume and fees are read from the swap events they emit.
const CELLANA = "0x4bf51972879e3b95c4781a5cdcb9e1ee24ef483e7d22f2d903626f126df62bd1";
const SWAP_EVENT = `${CELLANA}::liquidity_pool::SwapEvent`;
const BPS = 10000;

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();

    // The event names the coin paid in and the amount, so a swap is booked once from the side it
    // was paid in on rather than from both legs.
    // amount_in is a u64 and can exceed what a double represents exactly, so it is summed as a
    // 38 digit decimal and returned as text; Balances.add takes the string unrounded.
    const rows: { pool: string, from_token: string, amount_in: string }[] = await queryDuneSql(options, `
        SELECT json_extract_scalar(data, '$.pool') AS pool,
               json_extract_scalar(data, '$.from_token') AS from_token,
               cast(sum(cast(json_extract_scalar(data, '$.amount_in') AS decimal(38,0))) AS varchar) AS amount_in
        FROM aptos.events
        WHERE TIME_RANGE
          AND event_type = '${SWAP_EVENT}'
          AND tx_success = true
        GROUP BY 1, 2
    `);

    // Each pool sets its own rate and the fee is taken off the amount paid in: for a pool whose
    // swap_fee_bps is 10, get_amount_out reports a fee of exactly amount_in / 1000 on either side.
    // A day touches a couple of dozen pools, so this is one call per pool that actually traded.
    // The rate is mutable (set_pool_swap_fee), so it is read at the end of the day being requested
    // rather than at head. Public Aptos fullnodes prune state after about ten days and answer 410
    // for older versions, so for anything past that the current rate is the only one obtainable.
    const version = await getVersionFromTimestamp(new Date(options.endTimestamp * 1000)).catch(() => undefined);
    const pools = [...new Set(rows.map((row) => row.pool))];
    const feeBps: Record<string, number> = {};
    await Promise.all(pools.map(async (pool) => {
        const readFee = (ledgerVersion?: number) => view(`${CELLANA}::liquidity_pool::swap_fee_bps`, [], [pool], ledgerVersion);
        const [bps] = version === undefined ? await readFee() : await readFee(version).catch(() => readFee());
        feeBps[pool] = Number(bps);
    }));

    for (const row of rows) {
        dailyVolume.add(row.from_token, row.amount_in);
        dailyFees.add(row.from_token, (BigInt(row.amount_in) * BigInt(feeBps[row.pool]) / BigInt(BPS)).toString());
    }

    return {
        dailyVolume,
        dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: 0,
        dailyHoldersRevenue: dailyFees,
    };
};

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    chains: [CHAIN.APTOS],
    start: '2024-02-28',
    dependencies: [Dependencies.DUNE],
    isExpensiveAdapter: true,
    methodology: {
        Volume: "Sum of the coin paid into each swap on Cellana's pools, from the liquidity_pool SwapEvent. Each swap is counted once, on the side it was paid in on.",
        Fees: "Swap fees, taken off the amount paid in at each pool's own swap_fee_bps.",
        Revenue: "All swap fees, which on Cellana go to veCELL voters rather than the protocol.",
        ProtocolRevenue: "Cellana keeps no share of swap fees.",
        HoldersRevenue: "All swap fees are distributed to veCELL voters.",
    },
};

export default adapter;
