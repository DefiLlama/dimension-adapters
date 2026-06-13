import { CHAIN } from "../../helpers/chains";
import { getConfig } from "../../helpers/cache";
import { FetchOptions, SimpleAdapter, FetchResult } from "../../adapters/types";

const chainConfig: Record<string, { start: string, chainName: string }> = {
    [CHAIN.ZETA]: { start: '2024-03-08', chainName: 'zetachain' },
    [CHAIN.UNICHAIN]: { start: '2024-11-21', chainName: 'unichain' },
    [CHAIN.BASE]: { start: '2024-03-19', chainName: 'base' },
    //[CHAIN.SANKO]: { start: '2024-10-04', chainName: 'sanko' },
    [CHAIN.OPTIMISM]: { start: '2024-02-09', chainName: 'optimism' },
    [CHAIN.HYPERLIQUID]: { start: '2025-03-04', chainName: 'hyperevm' },
    [CHAIN.BLAST]: { start: '2024-02-27', chainName: 'blast' },
    [CHAIN.ABSTRACT]: { start: '2024-11-21', chainName: 'abstract' },
    [CHAIN.SONIC]: { start: '2024-12-03', chainName: 'sonic' },
    [CHAIN.ARBITRUM]: { start: '2024-02-09', chainName: 'arbitrum' },
    [CHAIN.ETHERLINK]: { start: '2024-06-17', chainName: 'etherlink' },
    [CHAIN.SONEIUM]: { start: '2025-04-01', chainName: 'soneium' },
    [CHAIN.BERACHAIN]: { start: '2025-01-22', chainName: 'berachain' },
    [CHAIN.KLAYTN]: { start: '2024-06-22', chainName: 'kaia' },
    [CHAIN.APECHAIN]: { start: '2024-10-03', chainName: 'apechain' },
    [CHAIN.MONAD]: { start: '2025-11-24', chainName: 'monad' },
    // [CHAIN.SEI]: { start: '2024-08-15', chainName: 'sei-evm' },
    [CHAIN.TAIKO]: { start: '2024-06-05', chainName: 'taiko' },
    [CHAIN.STORY]: { start: '2025-03-06', chainName: 'story' },
};

const ENTROPY_REQUEST_ABI = 'event RequestedWithCallback (address indexed provider, address indexed requestor, uint64 indexed sequenceNumber, bytes32 userRandomNumber, tuple(address provider,uint64 sequenceNumber,uint32 numHashes,bytes32 commitment,uint64 blockNumber, address requester,bool useBlockhash, bool isRequestWithCallback) request)';

async function fetch(options: FetchOptions): Promise<FetchResult> {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const configs = await getConfig("pyth-entropy-configs", "https://fortuna.dourolabs.app/v1/chains/configs");
    const chainInfo = configs.find((chainDetails: any) => chainDetails.name === chainConfig[options.chain].chainName);
    
    if (!chainInfo) {
        return {
            dailyFees: 0,
            dailyRevenue: 0,
            dailySupplySideRevenue: 0,
        }
    }
    
    const pythEntropyContract = chainInfo.contract_addr;

    // Get total fee per request (current rate - note: historical fees may differ)
    let feePerRequest = await options.api.call({
        target: pythEntropyContract,
        abi: 'function getFeeV2() view returns (uint128)',
        permitFailure: true,
    });
    // Get Pyth protocol fee per request (goes to Pyth DAO)
    let pythFeePerRequest = await options.api.call({
        target: pythEntropyContract,
        abi: 'function getPythFee() view returns (uint128)',
        permitFailure: true,
    });

    const requestLogs = await options.getLogs({
        target: pythEntropyContract,
        eventAbi: ENTROPY_REQUEST_ABI
    });

    const numRequests = BigInt(requestLogs.length);

    if(!feePerRequest || !pythFeePerRequest) {
        feePerRequest = chainInfo.default_fee;
        pythFeePerRequest = 0;
    }

    dailyFees.addGasToken(BigInt(feePerRequest) * numRequests);
    dailyRevenue.addGasToken(BigInt(pythFeePerRequest) * numRequests);
    dailySupplySideRevenue.addGasToken(BigInt(feePerRequest - pythFeePerRequest) * numRequests);

    return {
        dailyFees,
        dailyRevenue,
        dailySupplySideRevenue,
    }
}

const methodology = {
    Fees: 'Total fees paid per Entropy randomness request. Fee = Provider fee (dynamic, covers gas) + Protocol fee (set by Pyth DAO governance).',
    Revenue: 'Protocol fees collected by Pyth DAO treasury per randomness request.',
    SupplySideRevenue: 'Provider fees paid to randomness providers for fulfilling requests (includes gas cost reimbursement).',
};

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    adapter: chainConfig,
    methodology,
}

export default adapter;
