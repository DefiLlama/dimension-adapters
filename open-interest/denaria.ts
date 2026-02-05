import axios from "axios";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const DENARIA_PERP_PAIR = "0xd07822ee341c11a193869034d7e5f583c4a94872";
const LINEA_USDC = "0x176211869cA2b568f2A7D4EE941E073a821EE1ff";

async function fetch(options: FetchOptions) {
  const openInterestAtEnd = options.createBalances();

  // call totalTraderExposure
  const totalTraderExposure = await options.api.call({
    target: DENARIA_PERP_PAIR,
    abi: "uint256:totalTraderExposure",
  });

  const totalTraderExposureBtc18 = BigInt(totalTraderExposure.toString());

  // timestamp price BTC
  let endTimestamp = Math.floor(Date.now() / 1000);

  if (typeof options.endTimestamp === "number") {
    endTimestamp = options.endTimestamp;
  } else {
    // keep default (now)
  }

  // set BTC price
  let btcPriceUsd: number;

  try {
    const { data } = await axios.get(
      `https://coins.llama.fi/prices/historical/${endTimestamp}/coingecko:bitcoin`
    );

    const maybePrice = data?.coins?.["coingecko:bitcoin"]?.price;

    if (typeof maybePrice !== "number" || maybePrice <= 0) {
      throw new Error(
        `Invalid BTC price response: ${JSON.stringify(data)?.slice(0, 300)}`
      );
    }

    btcPriceUsd = maybePrice;
  } catch (err: any) {
    throw new Error(
      `[Denaria][OI] Failed to fetch BTC price from coins.llama (ts=${endTimestamp}). ` +
        `Error: ${err?.message ?? String(err)}`
    );
  }

  const btcPriceUsd1e8 = BigInt(Math.round(btcPriceUsd * 1e8));

  // calc exposure trader in USDC
  const totalTraderExposureUSDC = (((totalTraderExposureBtc18 * btcPriceUsd1e8) / BigInt(1e8)) / BigInt(1e12))

  openInterestAtEnd.add(LINEA_USDC, totalTraderExposureUSDC.toString());

  return { openInterestAtEnd };
}

const methodology = {
  OpenInterestAtEnd:
    "Reads totalTraderExposure at the end of each period (BTC 1e18), converts to USD using BTC price at endTimestamp, returns as USDC(1e6).",
};

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.LINEA],
  fetch,
  start: "2025-12-14",
  methodology,
};

export default adapter;
