import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const GRID_MINING = '0x273c1Feb169EfA613e28c6678d9ECB8576bde959';
const TREASURY = '0xbC09F81Ac338f7Afe83146670A9Ff1fF0B2E6413';

// GridMining fee constants (basis points, matching contract)
const ADMIN_FEE_BPS = 100n;   // 1% of totalDeployed
const BPS = 10000n;

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const dailyProtocolRevenue = options.createBalances();
    const dailyHoldersRevenue = options.createBalances();

    // VaultReceived gives exact vault fee per round (no derivation needed)
    const vaultLogs = await options.getLogs({
        target: TREASURY,
        eventAbi: 'event VaultReceived(uint256 amount, uint256 totalVaulted)',
    });

    vaultLogs.forEach(log => {
        dailyFees.addGasToken(log.amount, "Vault Fees");
        dailyHoldersRevenue.addGasToken(log.amount, "Vault Fees");
    });
    // Deployed events give the exact deployed ETH amount
    const [deployed, deployedFor] = await Promise.all([
        options.getLogs({
            target: GRID_MINING,
            eventAbi: 'event Deployed(uint64 indexed roundId, address indexed user, uint256 amountPerBlock, uint256 blockMask, uint256 totalAmount)',
        }),
        options.getLogs({
            target: GRID_MINING,
            eventAbi: 'event DeployedFor(uint64 indexed roundId, address indexed user, address indexed executor, uint256 amountPerBlock, uint256 blockMask, uint256 totalAmount)',
        }),
    ]);

    let totalDeployed = 0n;
    for (const log of deployed)    totalDeployed += BigInt(log.totalAmount);
    for (const log of deployedFor) totalDeployed += BigInt(log.totalAmount);

    const adminFee = totalDeployed * ADMIN_FEE_BPS / BPS;
    dailyFees.addGasToken(adminFee, "Admin Fees");
    dailyProtocolRevenue.addGasToken(adminFee, "Admin Fees");

    return {
        dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue,
        dailyHoldersRevenue,
    };
};

const methodology = {
    Fees: 'Fees extracted per round: 1% admin fee on the total ETH deployed and 10% vault fee on losers pool after admin. Variable effective rate depending on winner/loser ratio.',
    Revenue: 'Includes all extracted fees (1% admin fee + 10% vault fee).',
    ProtocolRevenue: 'Includes admin fees (1% of total deployed).',
    HoldersRevenue: 'Vault fee (10% of losers pool after admin) is forwarded to Treasury, then bridged to Ethereum and used by the buyback bot to swap ETH for SpiceETH on Uniswap — 90% burned, 10% bridged back to Arbitrum and distributed to SPICE stakers via Treasury.distributeYield → Staking.',
};

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    adapter: {
        [CHAIN.ARBITRUM]: {
            fetch,
            start: '2026-04-29',
        },
    },
    methodology,
    breakdownMethodology: {
        Fees: {
            "Vault Fees": 'The Vault fee (10% of losers pool after admin) is bridged to Ethereum and then used to buyback SPICE, 90% is burned and 10% is distributed to SPICE Stakers in Arbitrum.',
            "Admin Fees": '1% admin fee on the total amount of ETH deployed on each round.',
        },
        Revenue: {
            "Vault Fees": 'The Vault fee (10% of losers pool after admin) is bridged to Ethereum and then used to buyback SPICE, 90% is burned and 10% is distributed to SPICE Stakers in Arbitrum.',
            "Admin Fees": '1% admin fee on the total amount of ETH deployed on each round.',
        },
        ProtocolRevenue: {
            "Admin Fees": '1% admin fee on the total amount of ETH deployed on each round.',
        },
        HoldersRevenue: {
            "Vault Fees": 'The Vault fee (10% of losers pool after admin) is bridged to Ethereum and then used to buyback SPICE, 90% is burned and 10% is distributed to SPICE Stakers in Arbitrum.',
        }
    }
};

export default adapter;
