import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter, FetchResult } from "../../adapters/types";

const chainConfig: Record<string, { start: string, chainName: string }> = {
    [CHAIN.ZETA]: { start: '2024-03-08', chainName: 'zetachain' },
    [CHAIN.UNICHAIN]: { start: '2024-11-21', chainName: 'unichain' },
    [CHAIN.BASE]: { start: '2024-03-19', chainName: 'base' },
    [CHAIN.SANKO]: { start: '2024-10-04', chainName: 'sanko' },
    [CHAIN.OPTIMISM]: { start: '2024-02-09', chainName: 'optimism' },
    [CHAIN.HYPERLIQUID]: { start: '2025-03-04', chainName: 'hyperevm' },
    [CHAIN.BLAST]: { start: '2024-02-27', chainName: 'blast' },
    [CHAIN.STORY]: { start: '2025-03-06', chainName: 'story' },
    [CHAIN.ABSTRACT]: { start: '2024-11-21', chainName: 'abstract' },
    [CHAIN.SONIC]: { start: '2024-12-03', chainName: 'sonic' },
    [CHAIN.ARBITRUM]: { start: '2024-02-09', chainName: 'arbitrum' },
    [CHAIN.ETHERLINK]: { start: '2024-06-17', chainName: 'etherlink' },
    [CHAIN.SONEIUM]: { start: '2025-04-01', chainName: 'soneium' },
    [CHAIN.BERACHAIN]: { start: '2025-01-22', chainName: 'berachain' },
    [CHAIN.TAIKO]: { start: '2024-06-05', chainName: 'taiko' },
    [CHAIN.KLAYTN]: { start: '2024-06-22', chainName: 'kaia' },
    [CHAIN.APECHAIN]: { start: '2024-10-03', chainName: 'apechain' },
};

const ENTROPY_REQUEST_ABI = 'event RequestedWithCallback (address indexed provider, address indexed requestor, uint64 indexed sequenceNumber, bytes32 userRandomNumber, tuple(address provider,uint64 sequenceNumber,uint32 numHashes,bytes32 commitment,uint64 blockNumber, address requester,bool useBlockhash, bool isRequestWithCallback) request)';

async function prefetch(_a: FetchOptions): Promise<any> {
    return await fetchURL("https://fortuna.dourolabs.app/v1/chains/configs")
}

async function fetch(options: FetchOptions): Promise<FetchResult> {
    const dailyFees = options.createBalances();
    const prefetchResults = options.preFetchedResults;

    const pythEntropyContract = prefetchResults.find((chainDetails: any) => chainDetails.name === chainConfig[options.chain].chainName).contract_addr

    try {
        const feePerRequest = await options.api.call({
            target: pythEntropyContract,
            abi: 'uint128:getFeeV2'
        });

        const requestLogs = await options.getLogs({
            target: pythEntropyContract,
            eventAbi: ENTROPY_REQUEST_ABI
        });

        dailyFees.addGasToken(feePerRequest * requestLogs.length);
    }
    catch (err) {
        console.log("RPC Error occured for chain " + options.chain);
    }

    return {
        dailyFees,
        dailyRevenue: 0,
        dailyProtocolRevenue: 0,
        dailyHoldersRevenue: 0
    }
}

const methodology = {
    DailyFees: 'Fees paid by projects to use pyth entropy services per request basis. All the fees goes to providers',
    DailyRevenue: "No revenue",
    DailyProtocolRevenue: "No protocol revenue",
    DailyHoldersRevenue: "No holders revenue"
};

const adapter: SimpleAdapter = {
    prefetch,
    version: 2,
    fetch,
    adapter: chainConfig,
    methodology,
}

export default adapter;