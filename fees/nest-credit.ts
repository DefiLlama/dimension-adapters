import { Adapter, FetchOptions, FetchResultV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import * as sdk from "@defillama/sdk";
import { httpGet } from "../utils/fetchURL";

// https://docs.nest.credit
const methodology = {
  Fees: "Total yields generated from real-world asset strategies in Nest vaults, including platform fees.",
  Revenue: "Platform fees collected by Nest Credit protocol.",
  ProtocolRevenue: "Platform fees collected by Nest Credit protocol.",
  SupplySideRevenue: "Yields distributed to vault depositors after protocol fees.",
};

interface IVault {
  vault: string;
  accountant: string;
}

const VAULTS_API = "https://api.nest.credit/v1/vaults";

async function getVaults(): Promise<IVault[]> {
  const { data } = await httpGet(VAULTS_API);
  return data
    .filter((v: any) => v.slug !== "nest-test-vault")
    .map((v: any) => ({
      vault: v.vaultAddress,
      accountant: v.accountantAddress,
    }));
}

const FEE_RATE_BASE = 1e4;

const abis = {
  totalSupply: "uint256:totalSupply",
  decimals: "uint8:decimals",
  base: "address:base",
  exchangeRateUpdated: "event ExchangeRateUpdated(uint96 oldRate, uint96 newRate, uint64 currentTime)",
  // V1: payoutAddress, feesOwedInBase, totalSharesLastUpdate, exchangeRate, upper, lower, lastUpdateTimestamp, isPaused, minimumUpdateDelay, platformFee
  accountantStateV1: "function accountantState() view returns(address,uint128,uint128,uint96,uint16,uint16,uint64,bool,uint32,uint16)",
};

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  const vaults = await getVaults();

  for (const { vault, accountant } of vaults) {
    const [totalSupply, decimals, token] = await Promise.all([
      options.api.call({ target: vault, abi: abis.totalSupply, permitFailure: true }),
      options.api.call({ target: vault, abi: abis.decimals, permitFailure: true }),
      options.api.call({ target: accountant, abi: abis.base, permitFailure: true }),
    ]);

    if (!totalSupply || !decimals || !token) continue;
    const vaultRateBase = Number(10 ** Number(decimals));

    // Track yield from exchange rate updates
    const rawLogs = await options.getLogs({
      eventAbi: abis.exchangeRateUpdated,
      target: accountant,
      entireLog: true,
    });

    for (const log of rawLogs) {
      const { oldRate, newRate } = (log as any).args;
      const growthRate = newRate > oldRate ? Number(newRate - oldRate) : 0;
      if (growthRate > 0) {
        const blockNumber = Number(log.blockNumber);

        const totalSupplyAtBlock = await sdk.api2.abi.call({
          abi: abis.totalSupply,
          target: vault,
          block: blockNumber,
          chain: options.chain,
          permitFailure: true,
        });

        const supply = totalSupplyAtBlock || totalSupply;
        const supplySideYield = Number(supply) * growthRate / vaultRateBase;

        dailyFees.add(token, supplySideYield, METRIC.ASSETS_YIELDS);
        dailySupplySideRevenue.add(token, supplySideYield, METRIC.ASSETS_YIELDS);
      }
    }

    // Calculate platform fees from V1 accountantState
    const accountantState = await options.api.call({
      target: accountant,
      abi: abis.accountantStateV1,
      permitFailure: true,
    });

    if (accountantState) {
      const exchangeRate = Number(accountantState[3]);
      const platformFeeRate = Number(accountantState[9]);
      if (platformFeeRate > 0) {
        const totalDeposited = Number(totalSupply) * exchangeRate / vaultRateBase;
        const yearInSecs = 365 * 24 * 60 * 60;
        const timespan = options.toTimestamp - options.fromTimestamp;
        const platformFee = totalDeposited * (platformFeeRate / FEE_RATE_BASE) * timespan / yearInSecs;

        dailyFees.add(token, platformFee, METRIC.MANAGEMENT_FEES);
        dailyProtocolRevenue.add(token, platformFee, METRIC.MANAGEMENT_FEES);
      }
    }
  }

  return {
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]: "Yields generated from real-world asset strategies in Nest vaults.",
    [METRIC.MANAGEMENT_FEES]: "Annualized platform fees charged on total assets under management.",
  },
  Revenue: {
    [METRIC.MANAGEMENT_FEES]: "Platform fees collected by Nest Credit protocol.",
  },
  ProtocolRevenue: {
    [METRIC.MANAGEMENT_FEES]: "Platform fees collected by Nest Credit protocol.",
  },
  SupplySideRevenue: {
    [METRIC.ASSETS_YIELDS]: "Yields distributed to vault depositors after protocol fees.",
  },
};

const adapter: Adapter = {
  version: 2,
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start: "2025-03-01" },
    [CHAIN.PLUME]: { fetch, start: "2025-03-01" },
    [CHAIN.BSC]: { fetch, start: "2025-03-01" },
    [CHAIN.ARBITRUM]: { fetch, start: "2025-03-01" },
    [CHAIN.PLASMA]: { fetch, start: "2025-11-01" },
  },
};

export default adapter;
