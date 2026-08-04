import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const FeeEvent = "event FeeInfo(address token, address indexed affiliatorAddress, uint256 platformFee, uint256 destinationExecutorFee, uint256 affiliateFee, uint16 indexed dAppTag)";
const FeeEventV2 = "event FeeInfo(address token, address indexed affiliatorAddress, uint256 affiliateFee, uint8 indexed feeType, uint16 indexed dAppTag)";

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const target = chainConfig[options.chain].contractAddress ?? RANGO_DIAMOND;

    const [logs , logsV2] = await Promise.all([
        options.getLogs({ target, eventAbi: FeeEvent }),
        options.getLogs({ target, eventAbi: FeeEventV2 }),
    ]);

    logs.forEach((log: any) => {
        const token = log.token;

        dailyFees.add(token, log.platformFee, 'Platform Fees');
        dailyFees.add(token, log.affiliateFee, 'Affiliate Fees');
        // dailyFees.add(token, log.destinationExecutorFee, 'Destination Executor Fees');

        dailyRevenue.add(token, log.platformFee, 'Platform Fees');

        dailySupplySideRevenue.add(token, log.affiliateFee, 'Affiliate Fees');
        // dailySupplySideRevenue.add(token, log.destinationExecutorFee, 'Destination Executor Fees');
    })

    logsV2.forEach((log: any) => {
        const token = log.token;
        dailyFees.add(token, log.affiliateFee, 'Affiliate Fees');
        dailySupplySideRevenue.add(token, log.affiliateFee, 'Affiliate Fees');
    })

    return {
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
        dailySupplySideRevenue,
    }
}

// Rango V2 diamond, deployed at the same address on every chain except the
// overrides below: https://docs.rango.exchange/smart-contracts/deployment-addresses
const RANGO_DIAMOND = '0x69460570c93f9DE5E2edbC3052bf10125f0Ca22d';

const chainConfig: Record<string, { start: string, contractAddress?: string }> = {
    [CHAIN.POLYGON]: { start: '2023-06-11' },
    [CHAIN.ARBITRUM]: { start: '2023-06-11' },
    [CHAIN.AVAX]: { start: '2023-06-11' },
    [CHAIN.OPTIMISM]: { start: '2023-06-11' },
    [CHAIN.BSC]: { start: '2023-06-11' },
    [CHAIN.FANTOM]: { start: '2023-06-11' },
    [CHAIN.CRONOS]: { start: '2023-07-06' },
    [CHAIN.POLYGON_ZKEVM]: { start: '2023-06-11' },
    [CHAIN.BOBA_BNB]: { start: '2023-07-04', contractAddress: '0xd9BdD77E9017C4727D3CdB87D91b7a0Fc7d63da4' },
    [CHAIN.ZORA]: { start: '2024-12-02' },
    [CHAIN.ETHEREUM]: { start: '2023-06-17' },
    [CHAIN.MOONBEAM]: { start: '2023-07-01' },
    [CHAIN.MOONRIVER]: { start: '2023-07-02' },
    [CHAIN.AURORA]: { start: '2023-07-02' },
    [CHAIN.BOBA]: { start: '2023-07-04', contractAddress: '0xd9BdD77E9017C4727D3CdB87D91b7a0Fc7d63da4' },
    [CHAIN.XDAI]: { start: '2023-07-04' },
    [CHAIN.LINEA]: { start: '2023-09-12' },
    [CHAIN.BASE]: { start: '2023-09-17' },
    [CHAIN.ERA]: { start: '2023-09-19', contractAddress: '0x13598FD0986D0E33c402f6907F05Acf720224527' },
    [CHAIN.SCROLL]: { start: '2024-01-29' },
    [CHAIN.CELO]: { start: '2024-05-01' },
    [CHAIN.BLAST]: { start: '2024-05-07' },
    [CHAIN.METIS]: { start: '2024-05-25' },
    [CHAIN.MODE]: { start: '2024-07-07' },
    [CHAIN.TAIKO]: { start: '2024-11-18' },
    // [CHAIN.XLAYER]: { start: '2023-06-11' },
}

const adapter: Adapter = {
    version: 2,
    pullHourly: true,
    fetch,
    adapter: chainConfig,
    methodology: {
        Fees: 'Platform fees, affiliate fees and destination executor fees charged by Rango on swaps and cross-chain transfers.',
        Revenue: 'Platform fees collected by Rango.',
        ProtocolRevenue: 'Platform fees collected by Rango.',
        SupplySideRevenue: 'Affiliate fees paid to integrators that route transactions, and destination executor fees paid to executors that complete transfers on the destination chain.',
    },
    breakdownMethodology: {
        Fees: {
            'Platform Fees': 'Fee charged by Rango on each swap or cross-chain transfer.',
            'Affiliate Fees': 'Fee charged on behalf of the integrator that routed the transaction.',
            // 'Destination Executor Fees': 'Fee covering execution costs on the destination chain.',
        },
        Revenue: {
            'Platform Fees': 'Platform fees are kept by Rango.',
        },
        ProtocolRevenue: {
            'Platform Fees': 'Platform fees are kept by Rango.',
        },
        SupplySideRevenue: {
            'Affiliate Fees': 'Affiliate fees are paid out to the integrator that routed the transaction.',
            // 'Destination Executor Fees': 'Destination executor fees are paid to executors that complete the transfer on the destination chain.',
        },
    },
};

export default adapter;
