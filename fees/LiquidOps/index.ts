import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { postURL } from "../../utils/fetchURL";

const endpoint = 'https://cu.ao-testnet.xyz';
const controllerId = 'SmmMv0rJwfIDVM3RvY2-P729JFYwhdGSeGo2deynbfY';

const geckoTickerTransformations: Record<string, string> = {
    'qAR': 'arweave',
    'wAR': 'arweave',
    'wUSDC': 'usd-coin',
    'wUSDT': 'tether',
    'wETH': 'ethereum',
};

async function DryRun(target: string, action: string) {
    const data = {
        Id: "1234",
        Target: target,
        Owner: "1234",
        Anchor: "0",
        Data: "1234",
        Tags: [
            ["Target", target],
            ["Action", action],
            ["Data-Protocol", "ao"],
            ["Type", "Message"],
            ["Variant", "ao.TN.1"]
        ].map(([name, value]) => ({ name, value }))
    }
    const res = await postURL(`${endpoint}/dry-run?process-id=${target}`, data, 3, {
        headers: {
            'Content-Type': 'application/json'
        }
    });
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return res;
}

function scaleBalance(amount: string, denomination: string): string {
    if (amount === "0") return "0";

    const scaledDivider = BigInt(10) ** BigInt(denomination);
    const balance = BigInt(amount);

    return (balance / scaledDivider).toString();
}

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const supportedTokensRes = await DryRun(controllerId, "Get-Tokens");
    const supportedTokens = JSON.parse(supportedTokensRes.Messages[0].Data);

    for (const poolObject of supportedTokens) {
        const infoRes = await DryRun(poolObject.oToken, "Info");
        const infoTagsObject = Object.fromEntries(
            infoRes.Messages[0].Tags.map((tag: any) => [tag.name, tag.value])
        );

        const totalReservesStr = scaleBalance(infoTagsObject['Total-Reserves'], infoTagsObject['Denomination']);
        const totalReserves = parseFloat(totalReservesStr);
        const reserveFactorPercent = Number(infoTagsObject['Reserve-Factor']);
        const reserveFactor = reserveFactorPercent / 100;

        if (totalReserves === 0 || reserveFactor === 0) continue;

        const totalFeesNum = totalReserves / reserveFactor;
        const supplySideRevenueNum = totalFeesNum - totalReserves;

        const totalFeesHuman = totalFeesNum.toString();
        const totalReservesHuman = totalReserves.toString();
        const supplySideRevenueHuman = supplySideRevenueNum.toString();

        const ticker = geckoTickerTransformations[poolObject.ticker] || poolObject.ticker;

        dailyFees.addCGToken(ticker, totalFeesHuman);
        dailyRevenue.addCGToken(ticker, totalReservesHuman);
        dailySupplySideRevenue.addCGToken(ticker, supplySideRevenueHuman);
    }

    return {
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
        dailySupplySideRevenue
    };
};

const methodology = {
    Fees: "Total interest paid by borrowers across all lending pools",
    Revenue: "Protocol's share of interest revenue (reserve factor portion)",
    ProtocolRevenue: "Protocol's share of interest going to treasury (from reserves)",
    SupplySideRevenue: "Interest paid to lenders (suppliers) in liquidity pools"
};

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.AO]: {
            fetch,
            start: '2025-06-10',
            runAtCurrTime: true,
        }
    },
    methodology
};

export default adapter;
