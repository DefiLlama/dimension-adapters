import { httpGet } from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const methodology = {
  Revenue: "All revenue is generated from user fees.",
  Fees: "Users pay a 1% fee for each trade. Additionally, approximately 2000 HBAR is charged when a token is migrated.",
};

const MIRROR_NODE_API_V1 =
  "https://mainnet-public.mirrornode.hedera.com/api/v1";
const FEE_COLLECTOR_CONTRACT = "0x00000000000000000000000000000000000ec550";

async function getContractBalance(contractAddress) {
  const response = await httpGet(
    `${MIRROR_NODE_API_V1}/accounts/${contractAddress}`
  );

  if (response && response.balance) {
    return response.balance.balance;
  }
  throw new Error(`Failed to fetch balance for contract: ${contractAddress}`);
}

async function calculateFees() {
  const totalFees = await getContractBalance(FEE_COLLECTOR_CONTRACT);
  return totalFees / 1e8; //we return the hbar amount
}

async function fetch(options: FetchOptions) {
  const fees = await calculateFees();
  const revenue = fees;

  return {
    totalFees: fees,
    totalRevenue: revenue,
  };
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.HEDERA]: {
      fetch,
      start: "2024-12-16",
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;
