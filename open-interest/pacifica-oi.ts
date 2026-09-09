import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const fetch = async (_a: any) => {
  const { data } = await fetchURL('https://api.pacifica.fi/api/v1/info/prices')

  // open_interest is double-sided (long+short), same engine convention as the doubled klines
  const oi = data.reduce((a: number, b: { open_interest: string, mark: string }) => a + (Number(b.open_interest) * Number(b.mark)), 0) / 2

  return {
    openInterestAtEnd: oi,
  };
}

export default {
  version: 2,
  fetch,
  chains: [CHAIN.SOLANA],
  runAtCurrTime: true
}
