import { Dependencies, FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";

// api.kriya.finance is NXDOMAIN and the kriya.finance apex resolves with no A record, so the
// endpoint this adapter read is gone along with the site. The AMM itself is still trading, so
// volume comes from the swap events its pools emit.
const PACKAGE = "0xa0eba10b173538c8fecca1dff298e488402cc9ff374f8a12ca7758eebe830b66";
const SWAP_EVENT = `${PACKAGE}::spot_dex::SwapEvent`;

// The event is emitted as SwapEvent<CoinIn>: its single type parameter is the coin that went INTO
// the pool, which is what amount_in is denominated in. The payload carries no direction field, so
// the type parameter is the only thing that identifies the side.
const inputCoin = (eventType: string) =>
    eventType.slice(eventType.indexOf("<") + 1, eventType.lastIndexOf(">")).trim();

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
    const dailyVolume = options.createBalances();

    const start = new Date(options.fromTimestamp * 1000).toISOString();
    const end = new Date(options.toTimestamp * 1000).toISOString();

    const rows: { type: string, parsed_json: any }[] = await queryAllium(`
        SELECT type, parsed_json
        FROM sui.raw.events
        WHERE checkpoint_timestamp >= '${start}' AND checkpoint_timestamp < '${end}'
          AND type LIKE '${SWAP_EVENT}<%'
    `);

    if (!rows.length)
        throw new Error(`kriya: no ${SWAP_EVENT} rows for ${start}, refusing to report it as no volume`);

    // Only the coin paid in is counted, so each swap is booked once rather than from both sides.
    for (const row of rows) dailyVolume.add(inputCoin(row.type), row.parsed_json.amount_in);

    return { dailyVolume };
};

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    dependencies: [Dependencies.ALLIUM],
    isExpensiveAdapter: true,
    fetch,
    chains: [CHAIN.SUI],
    start: '2023-05-09',
    methodology: {
        Volume: "Sum of the coin paid into each swap on Kriya's AMM pools, read from the spot_dex SwapEvent the pool emits. Each swap is counted once, on the side that was paid in.",
    },
};

export default adapter;
