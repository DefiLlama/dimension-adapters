// https://www.franklintempleton.com/investments/options/money-market-funds/products/29386/SINGLCLASS/franklin-on-chain-u-s-government-money-fund/FOBXX#distributions

import { ChainApi } from "@defillama/sdk";
import { Chain } from "../../adapters/types";
import axios from "axios";
import {
  Adapter,
  Fetch,
  FetchOptions,
  FetchResultFees,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

const CONFIG: Record<Chain, string> = {
  [CHAIN.POLYGON]: "0x408a634b8a8f0de729b48574a3a7ec3fe820b00a",
  [CHAIN.STELLAR]:
    "BENJI-GBHNGLLIE3KWGKCHIKMHJ5HVZHYIK7WTBE4QF5PLAKL4CJGSEU7HZIW5",
};

const EXPENSE_LIMITATION_TIMESTAMP = 1754006400; //  08/2025
const GROSS_EXPENSE_YEAR = 0.0026;
const NET_EXPENSE_YEAR = 0.002;

const stellarAUM = async (token: string): Promise<number> => {
  const stellarApi = `https://api.stellar.expert/explorer/public/asset/${token}`;
  const { data } = await axios.get(stellarApi);
  const { supply, toml_info } = data;
  const adjustedSupply = supply / 10 ** (toml_info.decimals - 6);
  return adjustedSupply;
};

const polygonAUM = async (token: string, api: ChainApi): Promise<number> => {
  const [decimals, supply] = await Promise.all([
    api.call({ target: token, abi: "erc20:decimals" }),
    api.call({ target: token, abi: "erc20:totalSupply" }),
  ]);

  const adjustedSupplyInUSDT = supply / 10 ** (decimals - 6);
  return adjustedSupplyInUSDT;
};

const fetch = async (
  timestamp: number,
  _: any,
  { api, createBalances, endTimestamp }: FetchOptions,
  token: string
): Promise<FetchResultFees> => {
  const dailyFees = createBalances();
  let supply: number = 0;

  if (api.chain === "polygon") supply = await polygonAUM(token, api);
  if (api.chain === "stellar") supply = await stellarAUM(token);

  const expenseRatio =
    endTimestamp < EXPENSE_LIMITATION_TIMESTAMP
      ? NET_EXPENSE_YEAR
      : GROSS_EXPENSE_YEAR;

  const dailySupply = (supply * expenseRatio) / 365;
  dailyFees.add(ADDRESSES.ethereum.USDT, dailySupply, { skipChain: true });

  return { timestamp, dailyFees };
};

const adapter: Adapter = {
  methodology: {
    Fees: 'Total yields are generated from investment assets, mostly US Treasuries.',
  },
  adapter: {
    [CHAIN.POLYGON]: {
      fetch: (...args: Parameters<Fetch>) =>
        fetch(...args, CONFIG[CHAIN.POLYGON]),
      runAtCurrTime: true,
      start: '2023-10-04',
    },
    [CHAIN.STELLAR]: {
      fetch: (...args: Parameters<Fetch>) =>
        fetch(...args, CONFIG[CHAIN.STELLAR]),
      runAtCurrTime: true,
      start: '2023-10-04',
    },
  },
};

export default adapter;
