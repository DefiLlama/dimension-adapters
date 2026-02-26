import { FetchResultV2, SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { getERC4626VaultsYield } from "../../helpers/erc4626";

const distributeFeesAbi = "event DistributeFees(address token, uint256 amount)";
const pirexFeesContract = "0x177D685384AA1Ac5ABA41b7E649F9fA0Be717fdb";
const autoPxEthHarvestAbi = "event Harvest(address indexed caller, uint256 value)";
const autoPxEthContract = "0x9Ba021B0a9b958B5E75cE9f6dff97C7eE52cb3E6";
const pxEthContract = "0x04C154b66CB340F3Ae24111CC767e0184Ed00Cc6";

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = await getERC4626VaultsYield({ options, vaults: [autoPxEthContract] });

  const feeLogs = await options.getLogs({
    target: pirexFeesContract,
    eventAbi: distributeFeesAbi
  })
  for (const log of feeLogs) {
    dailyFees.add(log.token, log.amount);
    dailyRevenue.add(log.token, log.amount);
  }

  const [platformFee, harvestLogs] = await Promise.all([
    options.api.call({
      target: autoPxEthContract,
      abi: "function platformFee() view returns (uint256)",
    }),
    options.getLogs({
      target: autoPxEthContract,
      eventAbi: autoPxEthHarvestAbi
    })
  ]);

  const FEE_DENOM = BigInt(1e6);
  for (const log of harvestLogs) {
    const feeAmount = (BigInt(log.value) * BigInt(platformFee)) / (FEE_DENOM - BigInt(platformFee));

    dailyFees.add(pxEthContract, feeAmount);
    dailyRevenue.add(pxEthContract, feeAmount);
  }
  const dailyProtocolRevenue = dailyRevenue.clone(0.575);
  const dailyHoldersRevenue = dailyRevenue.clone(0.425);

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
}

// breakdown source: https://dinero.xyz/docs/dinero-tokenomics
const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: "2023-12-11",
  methodology: {
    Fees: "A configurable fee on yield, 0.03% redemption fee, and a 0.5% instant redemption fee.",
    Revenue: "Fees collected from yield and redemption fees.",
    HoldersRevenue: "42.5% of fees are distributed to the DINERO staking pool.",
    ProtocolRevenue: "15% of fees are allocated to the DAO reserves and 42.5% to the protocol treasury.",
    SupplySideRevenue: "Yield earned by the AutoPxEth (apxETH) vault stakers.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.DEPOSIT_WITHDRAW_FEES]: "0.03% redemption fee and 0.5% instant redemption fee charged on pxETH redemptions.",
      [METRIC.PERFORMANCE_FEES]: "10% performance fee charged on pxETH yield.",
    },
    Revenue: {
      "DAO Reserves": "15% of collected fees are allocated to the DAO reserves.",
      "Protocol Treasury": "42.5% of collected fees are allocated to the protocol treasury.",
    },
    HoldersRevenue: {
      [METRIC.STAKING_REWARDS]: "42.5% of pxETH fees are distributed to DINERO stakers.",
    },
    SupplySideRevenue: {
      [METRIC.ASSETS_YIELDS]: "Yield earned by the AutoPxEth (apxETH) vault stakers.",
    }
  }
}

export default adapter;
