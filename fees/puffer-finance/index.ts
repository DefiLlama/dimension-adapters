import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// https://github.com/PufferFinance/Deployments-and-ACL/blob/main/docs/deployments/mainnet.md
// PufferVault contract address
const PUFFER_VAULT = "0xD9A442856C234a39a81a089C06451EBAa4306a72";

// ValidatorTicket contract - stores fee rates for VT minting
const VALIDATOR_TICKET = "0x7D26AD6F6BA9D6bA1de0218Ae5e20CD3a273a55A";

// Custom metrics for fee breakdown
const PROTOCOL_FEE_METRIC = 'Protocol Fee'; // Fee collected by Puffer protocol treasury
const GUARDIANS_FEE_METRIC = 'Guardians Fee'; // Fee collected by Puffer guardians

// ABIs for fetching contract data
const ABIS = {
  totalAssets: "uint256:totalAssets", // Total ETH backing pufETH
  totalSupply: "uint256:totalSupply", // Total pufETH supply
  getProtocolFeeRate: "uint256:getProtocolFeeRate", // Treasury fee
  getGuardiansFeeRate: "uint256:getGuardiansFeeRate", // Guardians fee
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Fetch totalAssets and totalSupply before and after
  const [assetsBefore, supplyBefore] = await Promise.all([
    options.fromApi.call({ target: PUFFER_VAULT, abi: ABIS.totalAssets }),
    options.fromApi.call({ target: PUFFER_VAULT, abi: ABIS.totalSupply }),
  ]);

  const [assetsAfter, supplyAfter] = await Promise.all([
    options.toApi.call({ target: PUFFER_VAULT, abi: ABIS.totalAssets }),
    options.toApi.call({ target: PUFFER_VAULT, abi: ABIS.totalSupply }),
  ]);

  // https://github.com/PufferFinance/puffer-contracts/blob/4eeb307f174bd83d131e5b1a49ba6c021145ae42/mainnet-contracts/src/ValidatorTicket.sol#L185
  // Calculate total fee rate (protocol + guardians) as a decimal
  // Fetch current protocol and guardians fee rates from the ValidatorTicket contract
  // Fees are returned in basis points (1% = 100, 100% = 10000)
  const protocolFeeRateBP = await options.toApi.call({
    target: VALIDATOR_TICKET, 
    abi: ABIS.getProtocolFeeRate,
  });

  const guardiansFeeRateBP = await options.toApi.call({
    target: VALIDATOR_TICKET, 
    abi: ABIS.getGuardiansFeeRate,
  });

  // Convert to decimal (10% = 0.10)
  const PROTOCOL_FEE = protocolFeeRateBP / 10000;
  const GUARDIANS_FEE = guardiansFeeRateBP / 10000;

  const rateBefore = (assetsBefore * 1e18) / supplyBefore;
  const rateAfter = (assetsAfter * 1e18) / supplyAfter;

  // Net rewards
  const netRewards = ((rateAfter - rateBefore) * assetsBefore) / 1e18;

  // Gross rewards before protocol and guardian fees
  // https://docs.puffer.fi/yield/protocol/rewards
  const grossRewards = netRewards / (1 - PROTOCOL_FEE - GUARDIANS_FEE);

  const protocolFees = grossRewards * PROTOCOL_FEE;
  const guardiansFees = grossRewards * GUARDIANS_FEE;
  const supplySideRewards = grossRewards * (1 - PROTOCOL_FEE - GUARDIANS_FEE);

  // Track fees with breakdown by metric
  dailyFees.addGasToken(supplySideRewards, METRIC.STAKING_REWARDS);
  dailyFees.addGasToken(protocolFees, PROTOCOL_FEE_METRIC);
  dailyFees.addGasToken(guardiansFees, GUARDIANS_FEE_METRIC);
  dailyProtocolRevenue.addGasToken(protocolFees, PROTOCOL_FEE_METRIC);
  dailyProtocolRevenue.addGasToken(guardiansFees, GUARDIANS_FEE_METRIC);
  dailySupplySideRevenue.addGasToken(supplySideRewards, METRIC.STAKING_REWARDS);

  return {
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: "2024-05-01",
    },
  },
  methodology: {
    Fees: "Total yield from restaking rewards (AVS fees) and validator ticket sales, reflected in pufETH exchange rate appreciation",
    Revenue: "Protocol fee and guardians fee collected from yield distributed to pufETH holders.",
    ProtocolRevenue: "Protocol fee and guardians fee collected from yield distributed to pufETH holders.",
    SupplySideRevenue: "Yield accruing to pufETH holders via exchange rate appreciation from restaking and validator tickets, minus protocol and guardians fees.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.STAKING_REWARDS]: "Yield accruing to pufETH holders via exchange rate appreciation from restaking and validator tickets, minus protocol and guardians fees.",
      [PROTOCOL_FEE_METRIC]: "Protocol fee collected by Puffer protocol treasury from validator ticket minting.",
      [GUARDIANS_FEE_METRIC]: "Guardians fee collected by Puffer guardians from validator ticket minting.",
    },
    Revenue: {
      [PROTOCOL_FEE_METRIC]: "Protocol fee collected by Puffer protocol treasury from validator ticket minting.",
      [GUARDIANS_FEE_METRIC]: "Guardians fee collected by Puffer guardians from validator ticket minting.",
    },
    ProtocolRevenue: {
      [PROTOCOL_FEE_METRIC]: "Protocol fee collected by Puffer protocol treasury from validator ticket minting.",
      [GUARDIANS_FEE_METRIC]: "Guardians fee collected by Puffer guardians from validator ticket minting.",
    },
    SupplySideRevenue: {
      [METRIC.STAKING_REWARDS]: "Yield accruing to pufETH holders via exchange rate appreciation from restaking and validator tickets, minus protocol and guardians fees.",
    },
  },
};

export default adapter;
