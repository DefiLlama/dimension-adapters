import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const ABI: any = {
    FOLIO_FEE: 'event FolioFeePaid (address indexed recipient, uint256 amount)',
    PROTOCOL_FEE: 'event ProtocolFeePaid (address indexed recipient, uint256 amount)'
};

const OPEN_STABLE_INDEX = '0x323c03c48660fE31186fa82c289b0766d331Ce21';
const VOTE_LOCK_SQUILL = '0x2aEA77C4757D897AaE2710B8a60280777f504e8c';

async function fetch(_a: any, _b: any, options: FetchOptions) {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailyProtocolRevenue = options.createBalances();
    const dailyHoldersRevenue = options.createBalances();

    const folioFeePaidLogs = await options.getLogs({
        eventAbi: ABI.FOLIO_FEE,
        target: OPEN_STABLE_INDEX
    });

    const protocolFeePaidLogs = await options.getLogs({
        eventAbi: ABI.PROTOCOL_FEE,
        target: OPEN_STABLE_INDEX
    });

    folioFeePaidLogs.forEach((feePaid: any) => {
        if (feePaid.recipient === VOTE_LOCK_SQUILL)
            dailyHoldersRevenue.add(OPEN_STABLE_INDEX, feePaid.amount);
        else
            dailyProtocolRevenue.add(OPEN_STABLE_INDEX, feePaid.amount);

        dailyFees.add(OPEN_STABLE_INDEX, feePaid.amount);
        dailyRevenue.add(OPEN_STABLE_INDEX, feePaid.amount);
    });

    protocolFeePaidLogs.forEach((feePaid: any) => {
        dailyFees.add(OPEN_STABLE_INDEX, feePaid.amount);
    });

    return {
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue,
        dailyHoldersRevenue
    }
}

const methodology = {
    Fees: 'Includes mint fee and TVL fee of the DTF',
    Revenue: 'Includes all the fees post reserve protocol share',
    HoldersRevenue: 'Includes part of the fees distributed among SQUILL token lockers as governance share',
    ProtocolRevenue: 'Includes fee going to treasury/team wallet'
};

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    chains: [CHAIN.ETHEREUM],
    start: '2025-04-15',
    methodology,
    doublecounted: true //Reserve protocol
}

export default adapter;