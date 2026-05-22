import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const contracts: Record<string, {
  credits: string[];
  factory?: { block: number; address: string };
}> = {
  [CHAIN.ETHEREUM]: {
    credits: [
      "0xf6223C567F21E33e859ED7A045773526E9E3c2D5", // Fasanara Yield vault
      "0x4462eD748B8F7985A4aC6b538Dfc105Fce2dD165", // Bastion
      "0x14B8E918848349D1e71e806a52c13D4e0d3246E0", // Adaptive Frontier
      "0x433D5B175148dA32Ffe1e1A37a939E1b7e79be4d", // FalconX
      "0x9cF358aff79DeA96070A85F00c0AC79569970Ec3", // RockawayX
    ],
    factory: {
      block: 22938055,
      address: "0x59aabdad8fdabd227cc71543b128765f93906626",
    },
  },
  [CHAIN.POLYGON]: {
    credits: [
      "0xF9E2AE779a7d25cDe46FccC41a27B8A4381d4e52", // Bastion CV
    ],
  },
  [CHAIN.OPTIMISM]: {
    credits: [
      "0xD2c0D848aA5AD1a4C12bE89e713E70B73211989B", // FalconX (Deprecated)
    ],
  },
  [CHAIN.ARBITRUM]: {
    credits: [
      "0x3919396Cd445b03E6Bb62995A7a4CB2AC544245D", // Bastion Credit Vault
    ],
  },
};

const ABIs = {
  seniorVault: "address:AATranche",
  juniorVault: "address:BBTranche",
  underlyingToken: "address:token",
  seniorVaultPrice: "uint256:priceAA",
  juniorVaultPrice: "uint256:priceBB",
  fee: "uint256:fee",
  decimals: "uint8:decimals",
  totalSupply: "uint256:totalSupply",
  creditVaultDeployed: "event CreditVaultDeployed(address proxy)",
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  const { credits: staticCredits, factory } = contracts[options.chain];
  const credits = [...staticCredits];

  // Add factory-deployed vaults
  if (factory) {
    const logs = await options.getLogs({
      target: factory.address,
      eventAbi: ABIs.creditVaultDeployed,
      fromBlock: factory.block,
      cacheInCloud: true,
    });
    for (const log of logs) {
      const proxy = (log as any).proxy;
      if (proxy && !credits.find((addr: string) => addr.toLowerCase() === proxy.toLowerCase())) {
        credits.push(proxy);
      }
    }
  }

  if (credits.length === 0) return { dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue };

  const [seniorVaults, juniorVaults, underlyingTokens, fees] = await Promise.all([
    options.api.multiCall({ abi: ABIs.seniorVault, calls: credits, permitFailure: true }),
    options.api.multiCall({ abi: ABIs.juniorVault, calls: credits, permitFailure: true }),
    options.api.multiCall({ abi: ABIs.underlyingToken, calls: credits, permitFailure: true }),
    options.api.multiCall({ abi: ABIs.fee, calls: credits, permitFailure: true }),
  ]);

  // Filter to only valid vaults (with valid tranche addresses and token)
  const validIndices: number[] = [];
  for (let i = 0; i < credits.length; i++) {
    if (seniorVaults[i] && juniorVaults[i] && underlyingTokens[i] && fees[i] != null) {
      validIndices.push(i);
    }
  }

  if (validIndices.length === 0) return { dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue };

  const validCredits = validIndices.map((i) => credits[i]);
  const validSeniorVaults = validIndices.map((i) => seniorVaults[i]);
  const validJuniorVaults = validIndices.map((i) => juniorVaults[i]);
  const validTokens = validIndices.map((i) => underlyingTokens[i]);
  const validFees = validIndices.map((i) => fees[i]);

  const combinedTranches = [...validSeniorVaults, ...validJuniorVaults];
  const totalValid = validCredits.length;

  const [seniorPricesBefore, juniorPricesBefore, seniorPricesAfter, juniorPricesAfter] = await Promise.all([
    options.fromApi.multiCall({ abi: ABIs.seniorVaultPrice, calls: validCredits, permitFailure: true }),
    options.fromApi.multiCall({ abi: ABIs.juniorVaultPrice, calls: validCredits, permitFailure: true }),
    options.toApi.multiCall({ abi: ABIs.seniorVaultPrice, calls: validCredits, permitFailure: true }),
    options.toApi.multiCall({ abi: ABIs.juniorVaultPrice, calls: validCredits, permitFailure: true }),
  ]);

  const [trancheDecimals, trancheTotalSupply] = await Promise.all([
    options.api.multiCall({ abi: ABIs.decimals, calls: combinedTranches, permitFailure: true }),
    options.api.multiCall({ abi: ABIs.totalSupply, calls: combinedTranches, permitFailure: true }),
  ]);

  const seniorDecimals = trancheDecimals.slice(0, totalValid);
  const juniorDecimals = trancheDecimals.slice(totalValid);
  const seniorTotalSupply = trancheTotalSupply.slice(0, totalValid);
  const juniorTotalSupply = trancheTotalSupply.slice(totalValid);

  for (let i = 0; i < totalValid; i++) {
    const feeRate = Number(validFees[i]) / 100000;
    const token = validTokens[i];

    const addTrancheYield = (pricesBefore: any, pricesAfter: any, decimals: any, totalSupply: any) => {
      if (!pricesBefore || !pricesAfter || !decimals || !totalSupply) return;
      const priceChange = Number(pricesAfter) - Number(pricesBefore);
      if (priceChange <= 0) return;

      // Tranche prices are POST-fee (fees deducted before price update)
      // postFeeYield = grossYield * (1 - feeRate)
      const postFeeYield = priceChange * Number(totalSupply) / (10 ** Number(decimals));
      const perfFee = feeRate > 0 ? postFeeYield * feeRate / (1 - feeRate) : 0;

      dailyFees.add(token, postFeeYield, METRIC.ASSETS_YIELDS);
      dailyFees.add(token, perfFee, METRIC.PERFORMANCE_FEES);
      dailySupplySideRevenue.add(token, postFeeYield, METRIC.ASSETS_YIELDS);
      dailyRevenue.add(token, perfFee, METRIC.PERFORMANCE_FEES);
      dailyProtocolRevenue.add(token, perfFee, METRIC.PERFORMANCE_FEES);
    };

    // Senior tranche yield
    addTrancheYield(seniorPricesBefore[i], seniorPricesAfter[i], seniorDecimals[i], seniorTotalSupply[i]);
    // Junior tranche yield
    addTrancheYield(juniorPricesBefore[i], juniorPricesAfter[i], juniorDecimals[i], juniorTotalSupply[i]);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Gross yield from Pareto Credit Vault strategies: post-fee yield distributed to tranche holders plus performance fees (10-20%) calculated from on-chain tranche price appreciation.",
  Revenue: "Performance fees (10-20%) deducted from gross yield before tranche prices are updated on-chain.",
  ProtocolRevenue: "All performance fees are collected by the Pareto protocol treasury.",
  SupplySideRevenue: "Post-fee yield from Credit Vault strategies distributed to senior (AA) and junior (BB) tranche token holders via tranche price appreciation.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]: "Post-fee yield distributed to tranche holders, observed via tranche token price appreciation.",
    [METRIC.PERFORMANCE_FEES]: "10-20% performance fees on gross yield, calculated from post-fee tranche prices.",
  },
  Revenue: {
    [METRIC.PERFORMANCE_FEES]: "Performance fees collected by the Pareto protocol treasury.",
  },
  ProtocolRevenue: {
    [METRIC.PERFORMANCE_FEES]: "Performance fees collected by the Pareto protocol treasury.",
  },
  SupplySideRevenue: {
    [METRIC.ASSETS_YIELDS]: "Yield distributed to senior and junior tranche holders.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start: "2023-12-01" },
    [CHAIN.POLYGON]: { fetch, start: "2023-06-01" },
    [CHAIN.OPTIMISM]: { fetch, start: "2023-10-01" },
    [CHAIN.ARBITRUM]: { fetch, start: "2024-11-01" },
  },
  //pullHourly: true,
  allowNegativeValue: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
