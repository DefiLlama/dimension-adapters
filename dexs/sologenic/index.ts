import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

// Retrieves volume for trading in SOLO for the last 24hrs in a rolling window (should be called at about the same time every day for reliable data)
const fetchVolume: any = async () => {
  const currency = "534F4C4F00000000000000000000000000000000"; // Currency: SOLO
  const issuer = "rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz"; // Issuer: Sologenic
  const counterCurrency = "XRP"; // Counter currency: XRP
  const tradePair = currency + "+" + issuer + "/" + counterCurrency;
  const symbolList = [tradePair]
  // Transform json array symbolList to base64encoded json string
  const symbols = Buffer.from(JSON.stringify(symbolList)).toString('base64');
  const url = "https://apiv2.sologenic.org/tickers/24h?symbols=" + symbols;
  const headers = { "Network": "mainnet" };

  const response = await httpGet(url, { headers: headers });
  const data = await response;
  const d = data[Object.keys(data)[0]];
  return { dailyVolume: d.volume }
}

export default {
  version: 2,
  adapter: {
    [CHAIN.RIPPLE]: {
      fetch: fetchVolume,
      runAtCurrTime: true,
    },
  },
  methodology: {
    Volume: "Trading volume for the Sologenic DEX token, aggregation of trades on the Sologenic DEX"
  }
};
