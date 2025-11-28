import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Kintsu Protocol sMON vault address on Monad
const SMON_VAULT_ADDRESS = "0xA3227C5969757783154C60bF0bC1944180ed81B9";

// ABIs
const totalPooledAbi = "uint96:totalPooled";
const totalSharesAbi = "uint96:totalShares";
const getMintableProtocolSharesAbi = "uint96:getMintableProtocolShares";

// Helper function to calculate yield and protocol revenue
async function calculateLSTYield(
  options: FetchOptions,
  vaultAddress: string
): Promise<{ totalYield: number; protocolRevenue: number }> {
  try {
    // Fetch values at start and end of period
    const [pooledBefore, pooledAfter, sharesBefore, sharesAfter, protocolShares] = await Promise.all([
      options.fromApi.call({ target: vaultAddress, abi: totalPooledAbi }),
      options.toApi.call({ target: vaultAddress, abi: totalPooledAbi }),
      options.fromApi.call({ target: vaultAddress, abi: totalSharesAbi }),
      options.toApi.call({ target: vaultAddress, abi: totalSharesAbi }),
      options.toApi.call({ target: vaultAddress, abi: getMintableProtocolSharesAbi, permitFailure: true }),
    ]);

    if (!pooledBefore || !pooledAfter || !sharesBefore || !sharesAfter) {
      return { totalYield: 0, protocolRevenue: 0 };
    }

    // Convert to numbers
    const pooledBeforeNum = Number(pooledBefore);
    const pooledAfterNum = Number(pooledAfter);
    const sharesAfterNum = Number(sharesAfter);

    // Total yield = change in total pooled tokens
    const totalYield = pooledAfterNum - pooledBeforeNum;

    // Protocol shares represent the protocol's claim on the pool
    // Convert protocol shares to actual MON tokens using current exchange rate
    const rateAfter = pooledAfterNum / sharesAfterNum;
    const protocolRevenue = protocolShares ? Number(protocolShares) * rateAfter : 0;

    return {
      totalYield: totalYield > 0 ? totalYield : 0,
      protocolRevenue: protocolRevenue > 0 ? protocolRevenue : 0,
    };
  } catch (error) {
    console.error("Error calculating LST yield:", error);
    return { totalYield: 0, protocolRevenue: 0 };
  }
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const { totalYield, protocolRevenue } = await calculateLSTYield(options, SMON_VAULT_ADDRESS);

  // Daily Fees = Total staking rewards earned
  if (totalYield > 0) {
    dailyFees.addGasToken(totalYield);
  }

  // Daily Revenue = Protocol's share of the yield
  if (protocolRevenue > 0) {
    dailyRevenue.addGasToken(protocolRevenue);
  }

  // Supply Side Revenue = Yield distributed to sMON holders (total - protocol)
  const supplySideRevenue = totalYield - protocolRevenue;
  if (supplySideRevenue > 0) {
    dailySupplySideRevenue.addGasToken(supplySideRevenue);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Total staking rewards earned from staked MON tokens during the period.",
  Revenue: "Protocol fees calculated from getMintableProtocolShares converted to MON using current exchange rate.",
  ProtocolRevenue: "Protocol fees collected, sent to Kintsu treasury.",
  SupplySideRevenue: "Staking yield distributed to sMON token holders.",
};

const adapter: Adapter = {
  version: 2,
  methodology,
  adapter: {
    [CHAIN.MONAD]: {
      fetch,
      start: "2025-11-14", // Vault creation time
    },
  },
};

export default adapter;