import { FetchOptions, FetchResultV2, SimpleAdapter, Dependencies } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived, getSolanaReceived } from "../../helpers/token";

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

// SOLANA_TREASURY
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
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchEVM,
      start: "2024-05-16",
    },
    [CHAIN.BASE]: {
      fetch: fetchEVM,
      start: "2024-11-11",
    },
    [CHAIN.KATANA]: {
      fetch: fetchEVM,
      start: "2025-06-27",
    },
    [CHAIN.SONIC]: {
      fetch: fetchEVM,
      start: "2024-12-23",
    },
    [CHAIN.SOLANA]: {
      fetch: fetchSolana,
      start: "2025-04-02",
    },
  },
  methodology: {
    Fees:
      "Fixed 0.0001 LBTC Network Security Fee per redemption, tracked via LBTC inflows to Lombard treasury addresses across supported chains.",
    Revenue:
      "All redemption fees transferred to the Lombard treasury are counted as protocol revenue.",
    ProtocolRevenue:
      "Same as Revenue.",
    SupplySideRevenue: "0 — BTC staking yield accrues to LBTC holders"
  },  
};

export default adapter;
