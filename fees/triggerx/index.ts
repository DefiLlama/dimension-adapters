import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const GAS_REGISTRY = "0xe2AC670F7D66c69D547A44D08F9bA1Fc0Fc0f991";
const ETH = "0x0000000000000000000000000000000000000000";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  try {
    // Use multiCall to get the total deducted balance
    const [balanceBefore] = await options.fromApi.multiCall({
      calls: [{ target: GAS_REGISTRY }],
      abi: "function totalDeductedBalance() view returns (uint256)",
    });

    const [balanceAfter] = await options.toApi.multiCall({
      calls: [{ target: GAS_REGISTRY }],
      abi: "function totalDeductedBalance() view returns (uint256)",
    });

    // Convert to BigInt
    const totalBefore = BigInt(balanceBefore || '0');
    const totalAfter = BigInt(balanceAfter || '0');

    // Calculate daily fees as the difference
    const dailyDeductedBalance = totalAfter - totalBefore;

    // Add daily deducted balance as fees
    dailyFees.add(ETH, dailyDeductedBalance.toString());

    // Add total fees (cumulative)
    const totalFees = options.createBalances();
    totalFees.add(ETH, totalAfter.toString());

    // Revenue equals fees
    dailyRevenue.addBalances(dailyFees);

    return {
      dailyFees,
      dailyRevenue,
      totalFees,
    };
  } catch (error) {
    // Fallback to event-based approach if contract call fails
    console.log("Contract call failed, falling back to event-based approach:", error.message);

    // Track ETH deposits only
    const depositLogs = await options.getLogs({
      target: GAS_REGISTRY,
      eventAbi: "event ETHDeposited(address indexed user, uint256 ethAmount)",
    });

    for (const log of depositLogs) {
      const ethAmount = BigInt(log.ethAmount);

      // Add fees (100% of deposits in ETH)
      dailyFees.add(ETH, ethAmount.toString());

      // Revenue equals fees
      dailyRevenue.add(ETH, ethAmount.toString());
    }
  }

  return {
    dailyFees,
    dailyRevenue,
    // dailyHoldersRevenue: options.createBalances(),
    // dailySupplySideRevenue: options.createBalances(),
  };
};

const methodology = {
  Fees: "Total gas fees deducted by the protocol. DefiLlama converts to USD using current ETH price.",
  Revenue: "Total gas fees deducted by the protocol (same as fees).",
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: 1723507200,
    }
  },
  methodology,
};

export default adapter;