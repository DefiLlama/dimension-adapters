import { CHAIN } from "../../helpers/chains";
import { getConfig } from "../../helpers/cache";
import { FetchOptions, SimpleAdapter, FetchResult } from "../../adapters/types";

const chainConfig: Record<string, { start: string, chainName: string }> = {
    [CHAIN.ZETA]: { start: '2024-03-08', chainName: 'zetachain' },
    [CHAIN.UNICHAIN]: { start: '2024-11-21', chainName: 'unichain' },
    [CHAIN.BASE]: { start: '2024-03-19', chainName: 'base' },
    [CHAIN.SANKO]: { start: '2024-10-04', chainName: 'sanko' },
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

    // [CHAIN.STORY]: { start: '2025-03-06', chainName: 'story' },
    // [CHAIN.TAIKO]: { start: '2024-06-05', chainName: 'taiko' },
};

const ENTROPY_REQUEST_ABI = 'event RequestedWithCallback (address indexed provider, address indexed requestor, uint64 indexed sequenceNumber, bytes32 userRandomNumber, tuple(address provider,uint64 sequenceNumber,uint32 numHashes,bytes32 commitment,uint64 blockNumber, address requester,bool useBlockhash, bool isRequestWithCallback) request)';

async function fetch(options: FetchOptions): Promise<FetchResult> {
    const dailyFees = options.createBalances();

    const configs = await getConfig("pyth-entropy-configs", "https://fortuna.dourolabs.app/v1/chains/configs");
    const pythEntropyContract = configs.find((chainDetails: any) => chainDetails.name === chainConfig[options.chain].chainName).contract_addr

    const feePerRequest = await options.api.call({
        target: pythEntropyContract,
        abi: 'uint128:getFeeV2',
        permitFailure: true,
    });
    if (!feePerRequest) {
      return {
        dailyFees: 0,
        dailyRevenue: 0,
        dailySupplySideRevenue: 0,
      }
    }

    const requestLogs = await options.getLogs({
        target: pythEntropyContract,
        eventAbi: ENTROPY_REQUEST_ABI
    });

    dailyFees.addGasToken(feePerRequest * requestLogs.length);

    return {
        dailyFees,
        dailyRevenue: 0,
        dailySupplySideRevenue: dailyFees,
    }
}

const methodology = {
    Fees: 'Fees paid by projects to use pyth entropy services per request basis.',
    SupplySideRevenue: 'All the fees from pyth entropy services goes to providers.',
    Revenue: "No revenue.",
};

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    adapter: chainConfig,
    methodology,
}

export default adapter;