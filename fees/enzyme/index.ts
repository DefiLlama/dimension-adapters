import axios from "axios";
import { FetchOptions, FetchResultFees, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getEnv } from "../../helpers/env";
import { getConfig } from "../../helpers/cache";

const BASE_URL = "https://api.onyx.enzyme.finance";
const LIST_URL = "https://api.enzyme.finance/enzyme.enzyme.v1.EnzymeService/GetVaultList";

const API_KEY = getEnv('ENZYME_API_KEY')

const getVaultList = async () => {
  const data = await getConfig('enzyme-vaults', '', {
    fetcher: async () => {
      const response = await axios.post(
        LIST_URL,
        {},
        { headers: { Authorization: `Bearer ${API_KEY}` } }
      );
      return response.data;
    }
  })

  return data.vaults || [];
};

const getVaultConfig = async (address: string) => {
  const data = await getConfig(`enzyme-vaults-${address}`, '', {
    fetcher: async () => {
      const response = await axios.get(
        `${BASE_URL}/vaults/${address}/configuration`,
        { headers: { Authorization: `Bearer ${API_KEY}` } }
      );
      return response.data;
    }
  })
  
  return data;
};


const getVaultSettledFees = async (vault: any) => {
  const config = await getVaultConfig(vault.address);
  if (!config?.feeHandler) return 0;

  const handler = config.feeHandler;
  const trackers = [
    "continuous-flat-rate-performance-fee-tracker",
    "continuous-flat-rate-management-fee-tracker",
  ];

  let total = BigInt(0);

  for (const t of trackers) {
    const { data } = await axios.get(
      `${BASE_URL}/vaults/${vault.address}/components/${t}/${handler}`,
      { headers: { Authorization: `Bearer ${API_KEY}` } }
    );
    total += BigInt(data.totalFeesSettled || 0);
  }

  // Return in ETH
  return Number(total);
};


const fetch = async (_a: any, _b: any, options: FetchOptions): Promise<FetchResultFees> => {
  const vaults = await getVaultList();

  let totalEth = 0;
  let activeVaults = 0;

  for (const v of vaults) {
    const value = await getVaultSettledFees(v);
    if (value > 0) {
      activeVaults++;
      totalEth += value;
    }
  }
  
  const dailyFees = options.createBalances()
  dailyFees.addGasToken(totalEth)

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2022-01-01',
    },
  },
  methodology: {
    Fees: "Reads settled performance + management fees from Enzyme fee handler trackers.",
    Revenue: "Uses totalFeesSettled as realized revenue.",
    ProtocolRevenue: "Uses totalFeesSettled as realized revenue.",
  },
};

export default adapter;