import ADDRESSES from '../../helpers/coreAssets.json'
import { FetchOptions } from "../../adapters/types";
import { addTokensReceived } from '../../helpers/token';

const vault_factory = "0x984e0eb8fb687afa53fc8b33e12e04967560e092";

const abis: any = {
  "getVaults": "function getVaults(uint256 index) view returns (address[] vaults)",
  "marketIndex": "uint256:marketIndex"
};

const tokens = [
  ADDRESSES.arbitrum.ARB, // ARB
  ADDRESSES.arbitrum.WETH, // WETH
];
const treasury = "0x5c84cf4d91dc0acde638363ec804792bb2108258";


const fetch = async (options: FetchOptions) => {
  const { api, createBalances } = options
  const vaultRes = await api.fetchList({ lengthAbi: abis.marketIndex, itemAbi: abis.getVaults, target: vault_factory })

  const vaults = vaultRes.flat()
  const dailyFees = createBalances()

  await addTokensReceived({ options, tokens, fromAdddesses: vaults, target: treasury, balances: dailyFees })


  return { dailyFees, dailyRevenue: dailyFees, };
};

export default fetch;
