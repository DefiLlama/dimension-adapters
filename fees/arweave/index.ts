import { SimpleAdapter, FetchOptions, ProtocolType } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const VIEWBLOCK_FEES_URL =
  "https://api.viewblock.io/arweave/stats/advanced/charts/txFees?network=mainnet";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dayTimestampMs = options.startOfDay * 1000;

  const data = await httpGet(VIEWBLOCK_FEES_URL, {
    headers: { origin: "https://arscan.io" },
  });

  const timestamps: number[] = data?.day?.data?.[0] ?? [];
  const fees: (number | string)[] = data?.day?.data?.[1] ?? [];

  const idx = timestamps.findIndex((ts) => ts === dayTimestampMs);
  // ViewBlock series occasionally lacks a point for a given day; treat it as 0
  // rather than throwing, which would break the entire backfill chart.
  const tokenAmount = idx === -1 ? 0 : Number(fees[idx]) || 0;

  dailyFees.addCGToken("arweave", tokenAmount, "Transaction Fees");

  // Arweave miners earn transaction fees as block rewards (PoW supply-side)
  const dailySupplySideRevenue = dailyFees.clone(1);

  return { dailyFees, dailySupplySideRevenue };
};

const methodology = {
  Fees: "Total transaction fees paid by users on the Arweave network. Sourced from ViewBlock's daily transaction-fees chart.",
  SupplySideRevenue:
    "Transaction fees earned by Arweave miners as block rewards for providing decentralized storage capacity.",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ARWEAVE],
  start: "2018-06-08",
  protocolType: ProtocolType.CHAIN,
  methodology,
  breakdownMethodology: {
    Fees: {
      "Transaction Fees": "Daily transaction fees aggregated by ViewBlock from base-layer Arweave transactions.",
    },
    SupplySideRevenue: {
      "Transaction Fees": "Fees distributed to Arweave miners for providing decentralized permanent storage.",
    },
  },
};

export default adapter;
