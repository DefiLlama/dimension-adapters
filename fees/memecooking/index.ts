import { formatUnits } from "ethers";
import { Adapter, FetchV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const API_BASE_URL = "https://api.meme.cooking";

type MemeCookingStats = {
  total_volume: string;
  total_protocol_fees: string;
  total_referral_fees: string;
  total_withdraw_fees: string;
};

const fetch: FetchV2 = async ({ endTimestamp, createBalances }) => {
  const dateString = new Date(endTimestamp * 1000).toISOString().split("T")[0];
  const {
    total_volume: daily_volume,
    total_protocol_fees: daily_protocol_fees,
    total_referral_fees: daily_referral_fees,
    total_withdraw_fees: daily_withdraw_fees,
  }: MemeCookingStats = await httpGet(
    `${API_BASE_URL}/info/daily-stats?date=${dateString}`
  );

  const dailyVolume = createBalances();
  dailyVolume.addCGToken("near", +formatUnits(daily_volume, 24));

  const dailyFees = createBalances();
  dailyFees.addCGToken(
    "near",
    +formatUnits(
      (
        BigInt(daily_protocol_fees) +
        BigInt(daily_referral_fees) +
        BigInt(daily_withdraw_fees)
      ).toString(),
      24
    )
  );

  const dailyRevenue = createBalances();
  dailyRevenue.addCGToken("near", +formatUnits(daily_protocol_fees, 24));

  const dailySupplySideRevenue = createBalances();
  dailySupplySideRevenue.addCGToken(
    "near",
    +formatUnits(daily_withdraw_fees, 24)
  );

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.NEAR]: {
      start: 1727708400,
      fetch,
      meta: {
        methodology: {
          Volume:
            "All deposits and withdrawals into currently ongoing auctions",
          Fees: "Fees from deposits (0.5%), withdrawals (2%) and referrals (shares 50% of deposit fee)",
          Revenue: "All fees from deposits are for the protocol",
          SupplySideRevenue:
            "There is a 2% withdrawal fee, which gets redistributed to all depositors of the same auction",
        },
      },
      runAtCurrTime: true,
    },
  },
  version: 2,
};

export default adapter;
