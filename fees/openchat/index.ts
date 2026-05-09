import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

interface DiamondPayments {
  amount_raised: [string, number][];
  manual_payments_taken: number;
  recurring_payments_taken: number;
}

interface OpenChatMetrics {
  diamond_members: {
    payments: DiamondPayments;
  };
}

// Token decimals on ICP (e8s = 10^8 base units)
const E8S = 1e8;

// Membership prices in token base units (e8s), 1month, 3months, 1year
const PRICES = {
  ICP:  { "1m": 0.15, "3m": 0.35, "1y": 1.00, lifetime: 4.00 },
  CHAT: { "1m": 2,    "3m": 5,    "1y": 15,   lifetime: 60   },
};

async function fetch(options: FetchOptions) {
    let response: OpenChatMetrics;
    try {
        response = await httpGet("https://4bkt6-4aaaa-aaaaf-aaaiq-cai.raw.ic0.app/metrics");
    } catch (e) {
        return {
            totalFees: options.createBalances(),
            totalRevenue: options.createBalances(),
        }
    }

    const amountRaised = response.diamond_members.payments.amount_raised;

    // Extract raw e8s balances from the [token, amount] tuple array
    const icpE8s  = amountRaised.find(([token]) => token === "ICP")?.[1]  ?? 0;
    const chatE8s = amountRaised.find(([token]) => token === "CHAT")?.[1] ?? 0;

    const icpRevenue  = icpE8s  / E8S;
    const chatRevenue = chatE8s / E8S;

    const totalFees = options.createBalances();
    const dailyRevenue = options.createBalances();

    // Add ICP revenue (native chain token)
    totalFees.addCGToken("internet-computer", icpRevenue);
    dailyRevenue.addCGToken("internet-computer", icpRevenue);

    // Add CHAT token fees paid by users
    totalFees.addCGToken("openchat", chatRevenue);

    return {
        totalFees,
        dailyRevenue,
    };
}

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    chains: [CHAIN.ICP],
    start: '2026-05-08',
    runAtCurrTime: true,
    methodology: {
        Fees: "Fees collected from diamond memberships.",
        Revenue: "Fees calculated from diamond memberships.",
    },
};

export default adapter;