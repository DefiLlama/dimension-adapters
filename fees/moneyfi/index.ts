
import axios from "axios";
import { SimpleAdapter, FetchOptions } from"../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getEnv } from "../../helpers/env";

const BASE = getEnv("APTOS_PRC") as string;
const API  = BASE.endsWith("/v1") ? BASE : `${BASE}/v1`;
const VIEW_URL = `${API}/view`;
const VIEW_FN = "0x97c9ffc7143c5585090f9ade67d19ac95f3b3e7008ed86c73c947637e2862f56::vault::get_fee";


const USDC_TOKEN = "0xbae207659db88bea0cbead6da0ed00aac12edcdda169e591cd41c94180b46f3b";
const USDT_TOKEN = "0x357b0b74bc833e95a115ad22604854d6b0fca151cecd94111770e5d6ffc9dc2b";

const TOKENS = [
  { arg: USDC_TOKEN, decimals: 6 },           
  { arg: USDT_TOKEN, decimals: 6 },           

];


const fetch = async (_opts: FetchOptions) => {
const FeesCollected = _opts.createBalances();

  const results = await Promise.all(
    TOKENS.map(t =>
      axios.post(VIEW_URL, {
        function: VIEW_FN,
        type_arguments: [],
        arguments: [t.arg],
      })
    )
  );
  

  let usdTotal = 0;
  results.forEach((res, i) => {
    const raw = BigInt(Array.isArray(res.data) ? res.data[0] : res.data);    
    usdTotal += (Number(raw) * 5) / 10 ** TOKENS[i].decimals;
  });

  FeesCollected.addUSDValue(usdTotal);

  return { FeesCollected };
};




const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.APTOS],
  start: "2025-08-04",
  methodology: { FeesCollected: "Revenue moneyfi" },
};

export default adapter;


