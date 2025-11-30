import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const fetch = async (_a: any) => {
  const { data } = await fetchURL('https://api.pacifica.fi/api/v1/info/prices')

  const volume = data.reduce((a: number, b: { volume_24h: string }) => a + Number(b.volume_24h), 0)
  const oi = data.reduce((a: number, b: { open_interest: string, mark: string }) => a + (Number(b.open_interest) * Number(b.mark)), 0)

  return {
    dailyVolume: volume,
    openInterestAtEnd: oi,
  };
}

export default {
  version: 2,
  fetch,
  chains: [CHAIN.SOLANA],
  runAtCurrTime: true
}