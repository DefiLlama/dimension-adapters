import { CHAIN } from "../../helpers/chains";
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";

const M_TOKEN = "0x866A2BF4E572CbcF37D5071A7a58503Bfb36be1b";
const MUSD_TOKEN = "0xacA92E438df0B2401fF60dA7E4337B687a2435DA";
const TRANSFER_EVENT = 'event Transfer(address indexed from, address indexed to, uint256 value)';
const STARTED_EARNING_EVENT = 'event StartedEarning(address indexed account)';
const INDEX_SCALE = 10n ** 12n; // https://docs.m0.org/protocol/m-token

const LABEL = 'mUSD Asset Yields';

/**
 * Measures historical backing M accrual after excluding transfers.
 * Bounds principal-conversion dust without hiding unexplained balance decreases.
 */
async function fetch(options: FetchOptions): Promise<FetchResultV2> {
    const dailyFees = options.createBalances();
    const fromBlock = await options.getFromBlock();
    const toBlock = await options.getToBlock();
    if (!Number.isInteger(fromBlock) || !Number.isInteger(toBlock) || fromBlock < 0 || fromBlock > toBlock)
        throw new Error('Invalid historical M balance window');
    const balanceCall = { abi: 'erc20:balanceOf', target: M_TOKEN, params: MUSD_TOKEN };
    const [openingBalance, closingBalance, transfers] = await Promise.all([
        options.fromApi.call(balanceCall),
        options.toApi.call(balanceCall),
        // The opening balance already includes transfers in fromBlock.
        fromBlock < toBlock ? options.getLogs({
            target: M_TOKEN,
            eventAbi: TRANSFER_EVENT,
            fromBlock: fromBlock + 1,
            toBlock,
        }) : [],
    ]);

    // Count index-driven growth, excluding deposits, withdrawals and donations.
    // On Linea, yield is recognized when a new M index reaches the chain.
    let dailyYield = BigInt(closingBalance) - BigInt(openingBalance);
    const account = MUSD_TOKEN.toLowerCase();
    let transferCount = 0n;
    for (const transfer of transfers) {
        const incoming = transfer.to.toLowerCase() === account;
        const outgoing = transfer.from.toLowerCase() === account;
        if (incoming) dailyYield -= BigInt(transfer.value);
        if (outgoing) dailyYield += BigInt(transfer.value);
        if (incoming || outgoing) transferCount++;
    }
    if (dailyYield < 0n) {
        // startEarning rounds principal down without a Transfer; stopEarning preserves balanceOf.
        // https://github.com/m0-platform/protocol/blob/spoke-upgradeable/src/MToken.sol
        const starts = fromBlock < toBlock ? await options.getLogs({
            target: M_TOKEN,
            eventAbi: STARTED_EARNING_EVENT,
            fromBlock: fromBlock + 1,
            toBlock,
        }) : [];
        const conversionCount = transferCount + BigInt(starts.filter(log => log.account.toLowerCase() === account).length);
        // Each transfer/start conversion can lose up to ceil(index / 1e12) units.
        const index = BigInt(await options.toApi.call({ target: M_TOKEN, abi: 'uint128:currentIndex' }));
        const roundingLimit = conversionCount * ((index + INDEX_SCALE - 1n) / INDEX_SCALE);
        if (-dailyYield > roundingLimit)
            throw new Error(`M yield decrease exceeds principal-conversion rounding (${dailyYield}, limit ${roundingLimit})`);
        dailyYield = 0n;
    }

    dailyFees.addUSDValue(Number(dailyYield) / 1e6, LABEL);

    return {
        dailyFees,
        dailyRevenue: dailyFees.clone(),
        dailyProtocolRevenue: dailyFees.clone()
    }
}

const methodology = {
    Fees: "Yield accrued by M backing MetaMask USD (mUSD), recognized on Linea when its M index updates.",
    Revenue: "All accrued M yield is allocated to the mUSD yield recipient.",
    ProtocolRevenue: "Yield allocated to the mUSD yield recipient.",
};

const breakdownMethodology = {
    Fees: {
        [LABEL]: "M token yield earned by the M backing MetaMask USD (mUSD).",
    },
    Revenue: {
        [LABEL]: "M yield allocated to the mUSD yield recipient.",
    },
    ProtocolRevenue: {
        [LABEL]: "M yield allocated to the mUSD yield recipient.",
    },
};

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: [CHAIN.ETHEREUM, CHAIN.LINEA],
    start: '2025-08-12',
    methodology,
    breakdownMethodology,
};

export default adapter;
