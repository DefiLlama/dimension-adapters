import * as sdk from "@defillama/sdk";
import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const cbETH = "0xbe9895146f7af43049ca1c1ae358b0541ea49704";
const MevFeeRecipient = "0xeBec795c9c8bBD61FFc14A6662944748F299cAcf";

const PROTOCOL_FEE = 0.10; // 10%

const ABIS = {
  exchangeRate: "uint256:exchangeRate",
  totalSupply: "uint256:totalSupply", 
};

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const [rateBefore, supplyBefore] = await Promise.all([
    options.fromApi.call({ target: cbETH, abi: ABIS.exchangeRate }),
    options.fromApi.call({ target: cbETH, abi: ABIS.totalSupply }),
  ]);

  const [rateAfter, supplyAfter] = await Promise.all([
    options.toApi.call({ target: cbETH, abi: ABIS.exchangeRate }),
    options.toApi.call({ target: cbETH, abi: ABIS.totalSupply }),
  ]);

  const assetsBefore = supplyBefore * rateBefore / 1e18;
  const assetsAfter = supplyAfter * rateAfter / 1e18;

  const netRewards = assetsAfter - assetsBefore;
  const grossRewards = netRewards / (1 - PROTOCOL_FEE);

  // MEV rewards
  let mevRewards = 0;
  const transactions = await sdk.indexer.getTransactions({
    chain: options.chain,
    transactionType: "to",
    addresses: [MevFeeRecipient],
    from_block: Number(options.fromApi.block),
    to_block: Number(options.toApi.block),
  });
  if (transactions) {
    for (const tx of transactions) {
      mevRewards += Number(tx.value);
    }
  }

  const dfExcludeMev = grossRewards - mevRewards;

  dailyFees.addGasToken(dfExcludeMev, METRIC.STAKING_REWARDS);
  dailyRevenue.addGasToken(dfExcludeMev * PROTOCOL_FEE, METRIC.STAKING_REWARDS);
  dailySupplySideRevenue.addGasToken(dfExcludeMev * (1 - PROTOCOL_FEE), METRIC.STAKING_REWARDS);

  dailyFees.addGasToken(mevRewards, METRIC.MEV_REWARDS);
  dailyRevenue.addGasToken(mevRewards * PROTOCOL_FEE, METRIC.MEV_REWARDS);
  dailySupplySideRevenue.addGasToken(mevRewards * (1 - PROTOCOL_FEE), METRIC.MEV_REWARDS);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue
  };
}

const methodology = {
  Fees: "Total validators fees and rewards from staked ETH.",
  SupplySideRevenue: "90% of rewards accrue to cbETH holders via exchange rate.",
  ProtocolRevenue: "10% staking commission kept by Coinbase on all rewards.",
  Revenue: "Coinbase takes a 10% staking service fee for ETH",
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: "2022-08-01",
    },
  },
  methodology,
  breakdownMethodology: {
    Fees: {
      [METRIC.STAKING_REWARDS]: "Beacon chain rewards from validators backing cbETH.",
      [METRIC.MEV_REWARDS]: "Execution-layer MEV tips sent to Coinbase validator fee recipient.",
    },
    Revenue: {
      [METRIC.STAKING_REWARDS]: "10% commission on staking rewards kept by Coinbase.",
      [METRIC.MEV_REWARDS]: "10% commission on MEV tips kept by Coinbase.",
    },
    ProtocolRevenue: {
      [METRIC.STAKING_REWARDS]: "10% commission on staking rewards kept by Coinbase.",
      [METRIC.MEV_REWARDS]: "10% commission on MEV tips kept by Coinbase.",
    },
    SupplySideRevenue: {
      [METRIC.STAKING_REWARDS]: "90% of staking rewards accrue to cbETH holders.",
      [METRIC.MEV_REWARDS]: "90% of MEV tips accrue to cbETH holders.",
    },
  },
};

export default adapter;

