import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import axios from "axios";

const endpoint = 'https://cu.ao-testnet.xyz';
const controllerId = 'SmmMv0rJwfIDVM3RvY2-P729JFYwhdGSeGo2deynbfY';

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

function scaleBalance(amount: string, denomination: string): string {
    if (amount === "0") return "0";
    
    // Keep the full precision by working with the raw amount
    const scaledDivider = BigInt(10) ** BigInt(denomination);
    const balance = BigInt(amount);
    
    // Return the scaled amount as string to preserve precision
    return (balance / scaledDivider).toString();
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
            const totalReservesStr = scaleBalance(infoTagsObject['Total-Reserves'], infoTagsObject['Denomination']);
            const totalReserves = parseFloat(totalReservesStr);
            const reserveFactorPercent = Number(infoTagsObject['Reserve-Factor']); // e.g., 10 for 10%
            const reserveFactor = reserveFactorPercent / 100; // Convert to decimal (0.1 for 10%)

            // Skip if no reserves or invalid reserve factor
            if (totalReserves === 0 || reserveFactor === 0) continue;

            // Calculate total fees from reserves and reserve factor (keep as integers)
            const totalFeesNum = totalReserves / reserveFactor;
            const supplySideRevenueNum = totalFeesNum - totalReserves;

            // Convert to integers by multiplying back up, then convert to string
            const denomination = parseInt(infoTagsObject['Denomination']);
            const scaleFactor = Math.pow(10, denomination);
            
            const totalFeesScaled = Math.floor(totalFeesNum * scaleFactor).toString();
            const totalReservesScaled = Math.floor(totalReserves * scaleFactor).toString();
            const supplySideRevenueScaled = Math.floor(supplySideRevenueNum * scaleFactor).toString();

            // Use the raw token ID
            const tokenAddress = poolObject.id; // Raw token ID from AO
            
            dailyFees.add(tokenAddress, totalFeesScaled);
            dailyRevenue.add(tokenAddress, totalReservesScaled);
            dailyProtocolRevenue.add(tokenAddress, totalReservesScaled);
            dailySupplySideRevenue.add(tokenAddress, supplySideRevenueScaled);
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
    version: 2,
    adapter: {
        'ao': {
            fetch,
            start: '2025-06-10',
            runAtCurrTime: true,
            meta: {
                methodology
            }
        }
    }
};

export default adapter;

// npm test fees liquidops