import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CuratorConfig, getCuratorExport } from "../helpers/curators";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { queryDuneSql } from "../helpers/dune";
import fetchURL from "../utils/fetchURL";

// Curator config for EVM chains
const curatorConfig: CuratorConfig = {
  vaults: {
    ethereum: {
      morphoVaultOwners: [
        '0xC684c6587712e5E7BDf9fD64415F23Bd2b05fAec',
      ],
    },
    base: {
      morphoVaultOwners: [
        '0x5a4E19842e09000a582c20A4f524C26Fb48Dd4D0',
        '0xFd144f7A189DBf3c8009F18821028D1CF3EF2428',
      ],
    },
    polygon: {
      morphoVaultOwners: [
        '0xC684c6587712e5E7BDf9fD64415F23Bd2b05fAec',
      ],
    },
  }
};

// Solana constants
const MANAGER_ADDRESS = 'G6L1NE8tLYYzvMHYHbkHZqPFvfEsiRAsHSvyNQ2hut3o';

// Correct vault addresses from the Python code (not PDAs)
const VAULT_ADDRESSES = [
  "CoHd9JpwfcA76XQGA4AYfnjvAtWKoBQ6eWBkFzR1A2ui", // hJLP 1x (USDC)
  "JCigGWJJRCPas7B9eUe2JgkyqQjGxMKkvZcJ7VQaNBqx", // hJLP 2x (USDC)
  "J6hcyp5rAsb1h7Qwgk763X6e2WnHgZa489VCE5VXgHLT", // Gauntlet Basis Alpha (USDC)
  "AocrjhFd2oxyVccz1vdnZc9Hd9bnW9ejuWWH73PedykU", // hJLP 1x (JLP)
  "4r3HvmEMqWFc5jgwfNQvzDnk7xb8JdhQ6AtcqQVLNXgP", // SOL Plus
  "5LVLbAddNbAiKscWqYV8GHwv6STb3xmqhhc6W5HoHVVg", // cbBTC Plus
  "6aowo7AoE6rw8CS6knd746XiRysuiEjs9YpZyHRAMnor", // dSOL Plus
  "4F7c7v9cZHatcZLy9TZFv1jrRrReACLBxciMkbDqVkfQ", // jitoSOL Plus
  "8ziYC1onrdfq2KhRQamz392Ykx8So48uWzd3f8tXJpVz", // DRIFT Plus
  "5M13RDhVWSGiuUPU3ewnxLWdMjcYx5zCzBLgvMjVuZ2K", // JTO Plus
  "425JLbAYgkQiRfyZLB3jDdibzCFT4SJFfyHHemZMpHpJ"  // Carrot hJLP
];

async function calculateGrossReturns(options: FetchOptions): Promise<number> {
  let totalGrossReturns = 0;

  // Extract snapshot timestamp (supports 'ts' in seconds, or 'timestamp'/'createdAt')
  const getSnapshotMs = (snapshot: any): number => {
    const rawTs = snapshot?.ts ?? snapshot?.timestamp ?? snapshot?.createdAt ?? 0;
    const numericTs = Number(rawTs);
    if (!Number.isFinite(numericTs) || numericTs <= 0) return 0;
    // If looks like seconds, convert to ms
    return numericTs < 1e12 ? numericTs * 1000 : numericTs;
  };

  for (const vaultAddress of VAULT_ADDRESSES) {
    const data = await fetchURL(`https://app.drift.trade/api/vaults/vault-snapshots?vault=${vaultAddress}`);

    if (data && Array.isArray(data) && data.length > 0) {
      const startTime = options.startTimestamp * 1000;
      const endTime = options.endTimestamp * 1000;

      const sortedData = data.sort((a, b) => getSnapshotMs(a) - getSnapshotMs(b));

      const periodSnapshots = sortedData.filter(snapshot => {
        const snapshotTime = getSnapshotMs(snapshot);
        return snapshotTime >= startTime && snapshotTime <= endTime;
      });

      const TOLERANCE_MS = 36 * 60 * 60 * 1000; // 36h
      let startSnapshot: any;
      let endSnapshot: any;

      if (periodSnapshots.length >= 2) {
        const periodSorted = periodSnapshots.sort((a, b) => getSnapshotMs(a) - getSnapshotMs(b));
        startSnapshot = periodSorted[0];
        endSnapshot = periodSorted[periodSorted.length - 1];
      } else {
        // latest <= startTime
        for (let i = sortedData.length - 1; i >= 0; i--) {
          const t = getSnapshotMs(sortedData[i]);
          if (t <= startTime) { startSnapshot = sortedData[i]; break; }
        }
        // latest <= endTime
        for (let i = sortedData.length - 1; i >= 0; i--) {
          const t = getSnapshotMs(sortedData[i]);
          if (t <= endTime) { endSnapshot = sortedData[i]; break; }
        }
        // try after end within tolerance
        if (endSnapshot && startSnapshot && getSnapshotMs(startSnapshot) === getSnapshotMs(endSnapshot)) {
          const afterEnd = sortedData.find(s => getSnapshotMs(s) > endTime && (getSnapshotMs(s) - endTime) <= TOLERANCE_MS);
          if (afterEnd) endSnapshot = afterEnd;
        }
        // try before start within tolerance
        if (!startSnapshot || (endSnapshot && getSnapshotMs(startSnapshot) === getSnapshotMs(endSnapshot))) {
          const beforeStart = [...sortedData].reverse().find(s => getSnapshotMs(s) < startTime && (startTime - getSnapshotMs(s)) <= TOLERANCE_MS);
          if (beforeStart) startSnapshot = beforeStart;
        }
      }

      if (startSnapshot && endSnapshot && getSnapshotMs(endSnapshot) !== getSnapshotMs(startSnapshot)) {
        const startValue = (startSnapshot.totalAccountQuoteValue || 0) / 1e6;
        const endValue = (endSnapshot.totalAccountQuoteValue || 0) / 1e6;
        const startNetDeposits = ((startSnapshot.totalDeposits || 0) - (startSnapshot.totalWithdraws || 0)) / 1e6;
        const endNetDeposits = ((endSnapshot.totalDeposits || 0) - (endSnapshot.totalWithdraws || 0)) / 1e6;
        const startManagerFees = (startSnapshot.managerTotalFee || 0) / 1e6;
        const endManagerFees = (endSnapshot.managerTotalFee || 0) / 1e6;
        const startNetValue = startValue - startNetDeposits;
        const endNetValue = endValue - endNetDeposits;
        const periodReturns = endNetValue - startNetValue;
        const periodManagerFees = endManagerFees - startManagerFees;
        const periodValueGenerated = periodReturns + periodManagerFees;

        totalGrossReturns += periodValueGenerated;
      }
    }
  }

  return totalGrossReturns;
}

// Solana fetch function
const fetchSolana = async (_t: any, _a: any, options: FetchOptions) => {
  const dailyRevenue = options.createBalances();

  // Get manager fees from Dune SQL
  const vaultAddressesList = VAULT_ADDRESSES.map(addr => `'${addr}'`).join(', ');
  const managerFeesQuery = `
    SELECT 
      SUM(amount_display) as total_amount,
      token_mint_address,
      symbol
    FROM tokens_solana.transfers 
    WHERE from_owner IN (${vaultAddressesList})
      AND to_owner = '${MANAGER_ADDRESS}'
      AND block_time >= from_unixtime(${options.startTimestamp})
      AND block_time < from_unixtime(${options.endTimestamp})
    GROUP BY token_mint_address, symbol
    ORDER BY total_amount DESC
  `;
  const managerFeesData = await queryDuneSql(options, managerFeesQuery);

  if (managerFeesData && managerFeesData.length > 0) {
    managerFeesData.forEach((fee: any) => {
      if (fee.total_amount && fee.token_mint_address) {
        dailyRevenue.add(fee.token_mint_address, fee.total_amount, METRIC.MANAGERMENT_FEES);
      }
    });
  }

  // add revenue to fees
  const dailyFees = dailyRevenue.clone(1, METRIC.MANAGERMENT_FEES);
  const dailySupplySideRevenue = options.createBalances();

  const grossReturns = await calculateGrossReturns(options);

  // Cap fees at 0 - fees cannot be negative by definition
  const cappedGrossReturns = Math.max(0, grossReturns);

  dailyFees.addUSDValue(cappedGrossReturns, METRIC.ASSETS_YIELDS);
  dailySupplySideRevenue.addUSDValue(cappedGrossReturns, METRIC.ASSETS_YIELDS);

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

// Get curator export for EVM chains and combine with Solana
const curatorExport = getCuratorExport(curatorConfig);

// need to convert adapter v2 to adapter v1
for (const [chain, adapter] of Object.entries(curatorExport.adapter as any)) {
  (curatorExport.adapter as any)[chain] = {
    fetch: async (_t: any, _a: any, options: FetchOptions) => {
      return await (adapter as any).fetch(options);
    }
  }
}

const methodology = {
  Fees: "Daily value generated for depositors from vault operations during the specified time period (includes both gains and losses)",
  Revenue: "Daily performance fees claimed by the Gauntlet manager during the specified time period",
  ProtocolRevenue: "Daily performance fees claimed by the Gauntlet manager during the specified time period",
  SupplySideRevenue: "Amount of yields distributed to supply-side depositors.",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]: "Daily value generated for depositors from vault operations during the specified time period (includes both gains and losses)",
    [METRIC.MANAGERMENT_FEES]: "Management fees chagred by Gauntlet",
  },
  Revenue: {
    [METRIC.ASSETS_YIELDS]: "Daily performance fees claimed by the Gauntlet manager during the specified time period",
    [METRIC.MANAGERMENT_FEES]: "Management fees chagred by Gauntlet",
  },
  ProtocolRevenue: {
    [METRIC.ASSETS_YIELDS]: "Daily performance fees claimed by the Gauntlet manager during the specified time period",
    [METRIC.MANAGERMENT_FEES]: "Management fees chagred by Gauntlet",
  },
  SupplySideRevenue: {
    [METRIC.ASSETS_YIELDS]: "Amount of yields distributed to supply-side depositors.",
  },
}

const adapter: SimpleAdapter = {
  version: 1,
  breakdownMethodology,
  methodology,
  adapter: {
    ...curatorExport.adapter,
    [CHAIN.SOLANA]: {
      fetch: fetchSolana,
      start: '2024-01-01'
    },
  },
  allowNegativeValue: true,
  isExpensiveAdapter: true
};

export default adapter;
