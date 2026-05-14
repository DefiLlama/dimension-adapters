import { ethers } from "ethers";
import { getProvider } from "@defillama/sdk";
import { PromisePool } from "@supercharge/promise-pool";
import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import BigNumber from 'bignumber.js';

const VAULT_REGISTRY = "0x9732A52eB6BAc678BbC95F6C06Ba70a5b2071379";
const VAULT_REGISTERED_EVENT = "event VaultRegistered(address indexed vault, address indexed baseToken)";
const FEE_COLLECTED_EVENT = "event FeeCollected(address indexed feeAddress, uint256 amount)";
const LIQUIDATED_EVENT = "event Liquidated(address indexed owner, address indexed liquidator, uint256 collateralSeized, uint256 debtRepaid, uint256 liquidatorReward)";

const fetch = async (options: FetchOptions) => {
    const { createBalances, getLogs, api } = options;

    const dailyFees = createBalances();

    const vaults = await getLogs({
        target: VAULT_REGISTRY,
        eventAbi: VAULT_REGISTERED_EVENT,
        fromBlock: 80743203,
    });

    const { results: vaultData, errors } = await PromisePool
        .withConcurrency(5)
        .for(vaults)
        .process(async (i) => {
            // Collateral token is NOT the baseToken emitted by VaultRegistered
            // Reading directly from storage
            const collateralToken = await api.provider.getStorage(i.vault, "0x78");
            if (!collateralToken || collateralToken === ethers.ZeroHash) {
                return null;
            } else {
                const token = ethers.getAddress("0x" + collateralToken.slice(-40));
                return { vault: i.vault, collateral: token };
            };
        });
    
    if (errors.length) {
        throw errors[0];
    };

    const validPools = vaultData.filter(Boolean) as { vault: string; collateral: string }[];
    const collateralByVault = Object.fromEntries(validPools.map(p => [p.vault.toLowerCase(), p.collateral]));

    const liquidations = await getLogs({
        targets: validPools.map(i => i.vault),
        eventAbi: LIQUIDATED_EVENT,
        skipIndexer: true,
        entireLog: true,
    });

    const dailySupplySideRevenue = createBalances();

    for (const liq of liquidations) {
        const collateral = collateralByVault[(liq as any).address.toLowerCase()];
        if (!collateral) continue;
        dailyFees.add(collateral, liq.args.collateralSeized, "Liquidations");
        dailySupplySideRevenue.add(collateral, liq.args.collateralSeized, "Liquidations");
    };

    const feeData = await getLogs({
        targets: validPools.map(i => i.vault),
        eventAbi: FEE_COLLECTED_EVENT,
        skipIndexer: true,
    });

    for (const fee of feeData) {
        dailyFees.addUSDValue(new BigNumber(fee.args.amount.toString()).div(1e18).toNumber(), "Borrowing Fees")
    };

    return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees, dailySupplySideRevenue }
};

const breakdownMethodology = {
  Fees: {
    "Borrowing Fees": "A one-time 1% fee charged on stUSD minted from each vault.",
    "Liquidations": "Liquidated collateral distributed to Earn Pool depositors based on their share.",
  },
  Revenue: {
    "Borrowing Fees": "A one-time 1% fee charged on stUSD minted from each vault.",
  },
  ProtocolRevenue: {
    "Borrowing Fees": "A one-time 1% fee charged on stUSD minted from each vault.",
  },
  SupplySideRevenue: {
    "Liquidations": "Liquidated collateral distributed to Earn Pool depositors based on their share.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  breakdownMethodology,
  adapter: {
    [CHAIN.BSC]: {
      fetch,
      start: '2026-02-12',
    },
  },
};

export default adapter;