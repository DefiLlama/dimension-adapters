import { FetchOptions, FetchResultV2, SimpleAdapter, Dependencies } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived, getSolanaReceived } from "../../helpers/token";
import { queryDuneSql } from "../../helpers/dune";
import { queryAllium } from "../../helpers/allium";

/**
 * Lombard LBTC Fee Adapter
 *
 * Fees:
 * - Fixed 0.0001 LBTC Network Security Fee per redemption (tracked via treasury inflows)
 *
 * Methodology:
 * - EVM chains: Track all token inflows to treasury addresses using addTokensReceived
 * - Solana: Track treasury inflows using getSolanaReceived
 */

const LBTC_CONTRACTS = {
  [CHAIN.ETHEREUM]: "0x8236a87084f8B84306f72007F36F2618A5634494",
  [CHAIN.BASE]: "0xecAc9C5F704e954931349Da37F60E39f515c11c1",
  [CHAIN.BSC]: "0xecAc9C5F704e954931349Da37F60E39f515c11c1",
  [CHAIN.KATANA]: "0xecAc9C5F704e954931349Da37F60E39f515c11c1",
  [CHAIN.SONIC]: "0xecAc9C5F704e954931349Da37F60E39f515c11c1"
};

// Chain-specific addresses
const SOLANA_TREASURY = "4qKkExZ4T5yyVumc4qoTzoa8fwmhpDy2Zg9ZUoNwzSP9";

const ABIS = {
  getTreasury: "address:getTreasury"
};

const fetchEVM = async (options: FetchOptions): Promise<FetchResultV2> => {
  const chain = options.chain;
  const lbtcContract = LBTC_CONTRACTS[chain];

    // Get treasury address (where fees are sent)
    const treasury = await options.api.call({
      target: lbtcContract,
      abi: ABIS.getTreasury,
    });

    // Track all token inflows to treasury using addTokensReceived helper
    const dailyFees = await addTokensReceived({
      options,
      tokens: [lbtcContract], // Track LBTC inflows to treasury
      targets: [treasury],
    });

    return {
      dailyFees,
      dailyRevenue: dailyFees,
      dailyProtocolRevenue: dailyFees,
      dailySupplySideRevenue: 0,
    };
};

const fetchSolana = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = await getSolanaReceived({
    options,
    targets: [SOLANA_TREASURY],
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailySupplySideRevenue: 0,
  };
};
  
const adapter: SimpleAdapter = {
  version: 2,
  // dependencies: [Dependencies.DUNE],
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchEVM,
      start: "2024-01-01",
    },
    [CHAIN.BASE]: {
      fetch: fetchEVM,
      start: "2024-06-01",
    },
    [CHAIN.BSC]: {
      fetch: fetchEVM,
      start: "2024-06-01",
    },
    [CHAIN.KATANA]: {
      fetch: fetchEVM,
      start: "2024-10-01",
    },
    [CHAIN.SONIC]: {
      fetch: fetchEVM,
      start: "2024-10-01",
    },
    [CHAIN.SOLANA]: {
      fetch: fetchSolana,
      start: "2024-10-01",
    },
  },
  methodology: {
    Fees:
      "Fixed 0.0001 LBTC Network Security Fee per redemption, tracked via treasury inflows across chains with native BTC staking support.",
    Revenue:
      "All fees transferred to treasury are captured as protocol revenue from native BTC staking/unstaking operations.",
    ProtocolRevenue:
      "Same as Revenue.",
    SupplySideRevenue:
      "0 — staking yield accrues to LBTC holders; 8% commission goes to Finality Providers.",
  },
};

export default adapter;
