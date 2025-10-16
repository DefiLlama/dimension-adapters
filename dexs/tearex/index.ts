import type { SimpleAdapter } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";

const fetch = async () => {
  const api = "https://alpha-api.trex.trade/trade";
  const res = await httpGet(api);

  const groups = res?.trading?.marketGroup ?? {};
  const toNum = (v: unknown): number => {
    if (typeof v === "string") return Number(v);
    if (typeof v === "number") return v;
    return 0;
  };

  const totalBorrowAmount24h = Object.values(groups).reduce((sum: number, group: any) => {
    const open = toNum(group?.open?.borrowAmount24h);
    const closed = toNum(group?.closed?.borrowAmount24h);
    const subtotal = (Number.isFinite(open) ? open : 0) + (Number.isFinite(closed) ? closed : 0);
    return sum + subtotal;
  }, 0);

  return {
    dailyVolume: totalBorrowAmount24h / 1e6,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    sei: {
      fetch,
      runAtCurrTime: true,
    },
  },
};

export default adapter;
