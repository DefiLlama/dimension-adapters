import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import axios from "axios";

const endpoint = 'https://cu.ao-testnet.xyz';
const controllerId = 'SmmMv0rJwfIDVM3RvY2-P729JFYwhdGSeGo2deynbfY';

// CoinGecko ticker transformations
const geckoTickerTransformations: {[key: string]: string} = {
    'qAR': 'arweave',
    'wAR': 'arweave',
    'wUSDC': 'usd-coin',
    'wUSDT': 'tether',
    'wETH': 'ethereum',
};

const methodology = {
    Fees: "Total interest paid by borrowers across all lending pools",
    Revenue: "Protocol's share of interest revenue (reserve factor portion)",
    ProtocolRevenue: "Protocol's share of interest going to treasury (from reserves)",
    SupplySideRevenue: "Interest paid to lenders (suppliers) in liquidity pools"
};

// Access AO on-chain data via the node endpoint
async function DryRun(target: string, action: string) {
    const response = await axios.post(`${endpoint}/dry-run?process-id=${target}`, {
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
    }, {
        headers: {
            'Content-Type': 'application/json'
        }
    });
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return response.data;
}

function scaleBalance(amount: string, denomination: string): number {
    if (amount === "0") return 0;
    const denominationVal = parseInt(denomination);
    const len = amount.length;

    if (denominationVal >= len) {
        return parseFloat("0." + "0".repeat(denominationVal - len) + amount.replace(/0+$/, ""));
    }

    const integerPart = amount.substr(0, len - denominationVal);
    const fractionalPart = amount.substr(len - denominationVal).replace(/0+$/, "");

    if (fractionalPart === "") return parseInt(integerPart);

    return parseFloat(integerPart + "." + fractionalPart);
}

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailyProtocolRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    try {
        // Get all supported tokens/pools
        const supportedTokensRes = await DryRun(controllerId, "Get-Tokens");
        const supportedTokens = JSON.parse(supportedTokensRes.Messages[0].Data);

        // Process each pool
        for (const poolObject of supportedTokens) {
            // Get pool info
            const infoRes = await DryRun(poolObject.oToken, "Info");
            const infoTagsObject = Object.fromEntries(
                infoRes.Messages[0].Tags.map((tag: any) => [tag.name, tag.value])
            );

            // Extract key data
            const totalReserves = scaleBalance(infoTagsObject['Total-Reserves'], infoTagsObject['Denomination']);
            const reserveFactorPercent = Number(infoTagsObject['Reserve-Factor']); // e.g., 10 for 10%
            const reserveFactor = reserveFactorPercent / 100; // Convert to decimal (0.1 for 10%)

            // Skip if no reserves or invalid reserve factor
            if (totalReserves === 0 || reserveFactor === 0) continue;

            // Calculate total fees from reserves and reserve factor (in token amounts)
            const totalFees = totalReserves / reserveFactor;
            const supplySideRevenue = totalFees - totalReserves;

            // CoinGecko mapping
            const ticker = geckoTickerTransformations[poolObject.ticker] || poolObject.ticker;
            const tokenAddress = `coingecko:${ticker}`;
            
            dailyFees.add(tokenAddress, totalFees.toString());
            dailyRevenue.add(tokenAddress, totalReserves.toString());
            dailyProtocolRevenue.add(tokenAddress, totalReserves.toString());
            dailySupplySideRevenue.add(tokenAddress, supplySideRevenue.toString());
        }

    } catch (error) {
        console.error('Error fetching LiquidOps data:', error);
    }

    return {
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue,
        dailySupplySideRevenue
    };
};

const adapter: SimpleAdapter = {
    version: 1,
    adapter: {
        'ao': {
            fetch,
            start: '2025-06-12',
            runAtCurrTime: true,
            meta: {
                methodology
            }
        }
    }
};

export default adapter;

// npm test fees liquidops