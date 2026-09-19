import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

// Folks Finance xALGO (Algorand liquid staking) fees.
// Consensus rewards accrue to the app's ALGO balance; `claim_fee`
// method calls pay out the accrued protocol cut via an inner payment txn.
// The cut is a fixed share of gross consensus rewards (global state `fee`, 4 d.p.,
// e.g. 1000 = 10%), so gross rewards = claimed / feeRate; the rest accrues to
// xALGO holders through the xALGO/ALGO exchange rate.
// Source app: https://github.com/Folks-Finance/algorand-js-sdk (xalgo/constants/mainnet-constants.ts)

const ALGOD = "https://mainnet-api.algonode.cloud";
const ALGOD_INDEXER = "https://mainnet-idx.algonode.cloud";
const CONSENSUS_APP_ID = 1134695678;
// consensus app id 1134695678 -> escrow address (getApplicationAddress)
const CONSENSUS_APP_ADDRESS =
  "4MBB6O7EV2ZRIUKJT47B2NJ2BQPNJ3BQEQBPA7UN7MXWRG7U4OMPP6VOTY";
const CLAIM_FEE_METHOD_SELECTORS = ["bnnSxQ=="];
const ALGO_DECIMALS = 1e6;
const FEE_DP = 10_000n; // `fee` global state is 4 d.p.

const asciiKey = (b64: string) => Buffer.from(b64, "base64").toString("latin1");

const getFeeRate = async (): Promise<bigint> => {
  const app = await httpGet(`${ALGOD}/v2/applications/${CONSENSUS_APP_ID}`);
  const state = app?.params?.["global-state"];
  const entry = state?.find((s: any) => asciiKey(s.key) === "fee");
  return BigInt(entry?.value?.uint ?? 0);
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const afterTime = new Date(options.startTimestamp * 1000).toISOString();
  const beforeTime = new Date(options.endTimestamp * 1000).toISOString();

  const [feeRate, claimed] = await Promise.all([
    getFeeRate(),
    (async () => {
      let total = 0n;
      let nextToken: string | undefined;
      do {
        let url =
          `${ALGOD_INDEXER}/v2/transactions?address=${CONSENSUS_APP_ADDRESS}&address-role=sender&tx-type=pay` +
          `&after-time=${afterTime}&before-time=${beforeTime}&limit=1000`;
        if (nextToken) url += `&next=${nextToken}`;

        const res = await httpGet(url);
        const txns = res.transactions ?? [];

        for (const txn of txns) {
          if (txn["tx-type"] !== "appl") continue;
          const args = txn["application-transaction"]?.["application-args"];
          if (!args || !CLAIM_FEE_METHOD_SELECTORS.includes(args[0])) continue;

          const innerTxns = txn["inner-txns"];
          if (!innerTxns || innerTxns.length === 0) continue;
          const payout =
            innerTxns[innerTxns.length - 1]?.["payment-transaction"];
          if (payout) total += BigInt(payout.amount);
        }

        nextToken = res["next-token"];
      } while (nextToken);
      return total;
    })(),
  ]);

  if (claimed > 0n && feeRate > 0n) {
    const gross = (claimed * FEE_DP) / feeRate;
    const supplySide = gross - claimed;

    dailyFees.addCGToken(
      "algorand",
      Number(gross) / ALGO_DECIMALS,
      "Consensus Rewards",
    );
    dailyProtocolRevenue.addCGToken(
      "algorand",
      Number(claimed) / ALGO_DECIMALS,
      "Consensus Rewards To Treasury",
    );
    dailySupplySideRevenue.addCGToken(
      "algorand",
      Number(supplySide) / ALGO_DECIMALS,
      "Consensus Rewards To xALGO Holders",
    );
  }

  return {
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Gross ALGO consensus staking rewards.",
  Revenue: "Protocol share of consensus rewards, claimed via claim_fee.",
  ProtocolRevenue:
    "Protocol share of consensus rewards, claimed via claim_fee.",
  SupplySideRevenue: "Remaining consensus rewards accrued to xALGO holders.",
};

const breakdownMethodology = {
  Fees: {
    "Consensus Rewards": "Gross consensus rewards.",
  },
  Revenue: {
    "Consensus Rewards To Treasury":
      "ALGO paid out by claim_fee calls on the consensus app.",
  },
  ProtocolRevenue: {
    "Consensus Rewards To Treasury":
      "ALGO paid out by claim_fee calls on the consensus app.",
  },
  SupplySideRevenue: {
    "Consensus Rewards To xALGO Holders":
      "Non-retained consensus rewards, reflected in the xALGO exchange rate.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.ALGORAND]: {
      fetch,
      start: "2025-01-13",
    },
  },
};

export default adapter;
