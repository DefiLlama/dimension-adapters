import axios from "axios";
import { FetchOptions, FetchResultFees, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getEnv } from "../../helpers/env";
import { METRIC } from "../../helpers/metrics";

// Pyth's Hermes endpoint started requiring an API key and now answers 401, which took the previous
// version of this adapter down with it. It priced yield as the daily change in the eUSX redemption
// rate multiplied by supply; the protocol distributes that yield on-chain instead, so the transfer
// is read directly and no rate feed is needed.
//
// Solstice's yield program emits a TransferInYield event on each DistributeYield call. Its payload
// carries the USX amount handed to the eUSX backing account, which is exactly the yield accrued to
// eUSX holders for the period; the amount reconciles with the USX token balance delta the same
// transaction records.
const YIELD_PROGRAM = "HARVSXaBpt1TuD4PvqnscCQLzAWgDzGpkDadr76a489L";
const USX = "6FrrzDk5mQARGc1TDYoyVnSyRdds1t4PbtohCD6p3tgG";
const TRANSFER_IN_YIELD_DISCRIMINATOR = "3983162e2b54bd7a";
// Anchor lays the event out as an 8 byte discriminator then its fields; the transferred USX amount
// is the u64 at byte 72.
const AMOUNT_OFFSET = 72;

const FEES_YIELD_LABEL = METRIC.ASSETS_YIELDS;
const SUPPLY_SIDE_YIELD_LABEL = 'eUSX Yield To Holders';

// Every signature in the window is fetched, so one transient failure would otherwise take the whole
// day down with it. The error is still raised once the attempts are spent rather than turned into a
// missing distribution.
const rpc = async (method: string, params: any[]) => {
    let lastError: any;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const { data } = await axios.post(getEnv('SOLANA_RPC'), { jsonrpc: "2.0", id: 1, method, params });
            if (data.error) throw new Error(`solstice: solana rpc ${method} failed: ${JSON.stringify(data.error)}`);
            return data.result;
        } catch (e) {
            lastError = e;
            await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
        }
    }
    throw lastError;
};

// The yield account is only touched by these distributions, a couple of transactions a day, so
// walking its signatures back to the start of the day is cheap.
const signaturesInWindow = async (fromTimestamp: number, toTimestamp: number) => {
    const signatures: string[] = [];
    let before: string | undefined;
    while (true) {
        const page = await rpc("getSignaturesForAddress", [YIELD_PROGRAM, before ? { limit: 1000, before } : { limit: 1000 }]);
        if (!page?.length) break;
        for (const entry of page) {
            if (entry.blockTime >= fromTimestamp && entry.blockTime < toTimestamp && !entry.err) signatures.push(entry.signature);
        }
        // A signature whose blockTime is still null has not been timestamped yet, so the page says
        // nothing about whether the window is covered; keep paging rather than stopping short of it.
        const oldest = [...page].reverse().find((entry: any) => typeof entry.blockTime === "number");
        if (page.length < 1000 || (oldest && oldest.blockTime < fromTimestamp)) break;
        before = page[page.length - 1].signature;
    }
    return signatures;
};

// A distribution is a chain of cross program invocations, so the transaction's logs carry data from
// several programs and a signature only proves the yield program was touched somewhere. Invocations
// nest, so the program a log belongs to is the innermost frame still open, tracked as a stack; only
// the frames the yield program itself is executing in can carry its events.
const yieldProgramEvents = (logs: string[]) => {
    const events: Buffer[] = [];
    const frames: string[] = [];
    for (const log of logs) {
        const invoked = log.match(/^Program (\S+) invoke \[\d+\]$/);
        if (invoked) { frames.push(invoked[1]); continue; }
        if (/^Program \S+ (success|failed)/.test(log)) { frames.pop(); continue; }
        const emitted = log.match(/^Program data: (\S+)$/);
        if (emitted && frames[frames.length - 1] === YIELD_PROGRAM)
            events.push(Buffer.from(emitted[1], "base64"));
    }
    return events;
};

const yieldFromTransaction = async (signature: string) => {
    const tx = await rpc("getTransaction", [signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }]);
    // No transaction, or one without metadata, means the node could not serve the logs, not that
    // nothing was distributed; treating either as zero would quietly understate the day.
    if (!tx?.meta?.logMessages)
        throw new Error(`solstice: solana rpc returned no transaction logs for ${signature}`);
    let amount = 0;
    for (const event of yieldProgramEvents(tx.meta.logMessages)) {
        if (event.length < AMOUNT_OFFSET + 8) continue;
        if (event.subarray(0, 8).toString("hex") !== TRANSFER_IN_YIELD_DISCRIMINATOR) continue;
        amount += Number(event.readBigUInt64LE(AMOUNT_OFFSET));
    }
    return amount;
};

const fetch = async (options: FetchOptions): Promise<FetchResultFees> => {
    const dailyFees = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const signatures = await signaturesInWindow(options.startTimestamp, options.endTimestamp);
    const amounts = await Promise.all(signatures.map(yieldFromTransaction));
    const distributed = amounts.reduce((total, amount) => total + amount, 0);

    dailyFees.add(USX, distributed, FEES_YIELD_LABEL);
    dailySupplySideRevenue.add(USX, distributed, SUPPLY_SIDE_YIELD_LABEL);

    return {
        dailyFees,
        dailyRevenue: 0,
        dailySupplySideRevenue,
    };
};

const adapters: SimpleAdapter = {
    version: 1,
    fetch,
    chains: [CHAIN.SOLANA],
    start: '2025-10-05',
    methodology: {
        Fees: 'USX paid into the eUSX backing account by Solstice yield distributions, which is the yield eUSX holders accrue.',
        Revenue: 'No protocol revenue (yield fully passed to eUSX holders)',
        SupplySideRevenue: 'All distributed yield goes to eUSX holders.',
    },
    breakdownMethodology: {
        Fees: {
            [FEES_YIELD_LABEL]: 'USX transferred in by each DistributeYield call over the day.',
        },
        Revenue: 'No protocol revenue; all yield is passed through to eUSX holders.',
        SupplySideRevenue: {
            [SUPPLY_SIDE_YIELD_LABEL]: '100% of distributed yield is credited to eUSX holders',
        },
        HoldersRevenue: 'Not separately tracked in this adapter; holder distributions are represented in SupplySideRevenue.',
    }
};

export default adapters;
