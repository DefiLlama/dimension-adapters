const apiUrl = 'https://balanced.icon.community/api/v1/pools';
const SOLIDWALLET_ENDPOINT = 'https://ctz.solidwallet.io/api/v3';

// Helper function to fetch the real-time price of bnUSD from the Balanced Network Oracle, expressed in USD.
const fetchBnUsdPrice = async () => {
    const GET_PRICES = {
        jsonrpc: "2.0",
        id: new Date().getTime(),
        method: "icx_call",
        params: {
            to: "cx133c6015bb29f692b12e71c1792fddf8f7014652",
            dataType: "call",
            data: {
                method: "getLastPriceInUSD",
                params: { symbol: "bnUSD" }
            }
        }
    };

    const response = await fetch(SOLIDWALLET_ENDPOINT, {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(GET_PRICES)
    });

    if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.result) {
        throw new Error('No result found');
    }

    return (parseInt(data.result, 16) / 1e18).toFixed(5);
};

// Helper function to build a price map for conversion rates of all Balanced Network assets to USD.
const buildPriceMap = (data, bnUsdPrice) => {
    const priceMap = { bnUSD: Number(bnUsdPrice) };

    data.forEach(pool => {
        if (pool.base_symbol === 'bnUSD' || pool.quote_symbol === 'bnUSD') {
            if (pool.base_symbol !== 'bnUSD') {
                priceMap[pool.base_symbol] = parseFloat(pool.price_24h) * bnUsdPrice || 0;
            }
            if (pool.quote_symbol !== 'bnUSD') {
                priceMap[pool.quote_symbol] = 1 / (parseFloat(pool.price_24h) * bnUsdPrice || 1);
            }
        }
    });
    
    return priceMap;
};



// Helper function to calculate total Balanced DEX pool fees, expressed in pool base values.
const calculateTotalFeesInBase24h = (baseLpFees24h, baseBalnFees24h, quoteLpFees24h, quoteBalnFees24h, price24h, baseSymbol, priceMap) => {
    if (price24h === 0 || isNaN(price24h)) {
        return 0;
    }

    let totalFeesInBase24h = (baseLpFees24h + baseBalnFees24h) + ((quoteLpFees24h + quoteBalnFees24h) / price24h);

    if (totalFeesInBase24h > 0) {
        totalFeesInBase24h *= priceMap[baseSymbol] || 1;
    }

    return totalFeesInBase24h;
};

// Helper function to calculate total Balanced DEX pool volumes, expressed in USD.
const calculateTotalVolumesInUSD24h = (baseVolume24h, quoteVolume24h, baseSymbol, priceMap) => {
    const baseVolumeInUSD = baseVolume24h * (priceMap[baseSymbol] || 0);
    const quoteVolumeInUSD = quoteVolume24h * (priceMap['bnUSD'] || 1);

    return baseVolumeInUSD + quoteVolumeInUSD;
};

// Main function to fetch the 24-hour LP fees from the Balanced API and convert them to USD value
export const getPoolFees_24h = async () => {
    try {
        const bnUsdPrice = await fetchBnUsdPrice();
        const response = await fetch(apiUrl);
        const data = await response.json();

        const priceMap = buildPriceMap(data, bnUsdPrice);

        const totalLpFeesInUSD24h = data.reduce((total, pool) => {
            const baseLpFees24h = parseFloat(pool.base_lp_fees_24h) || 0;
            const quoteLpFees24h = parseFloat(pool.quote_lp_fees_24h) || 0;
            const baseBalnFees24h = parseFloat(pool.base_baln_fees_24h) || 0;
            const quoteBalnFees24h = parseFloat(pool.quote_baln_fees_24h) || 0;
            const baseSymbol = pool.base_symbol;
            const price24h = parseFloat(pool.price_24h) || 0;

            const totalFeesInBase24h = calculateTotalFeesInBase24h(
                baseLpFees24h,
                baseBalnFees24h,
                quoteLpFees24h,
                quoteBalnFees24h,
                price24h,
                baseSymbol,
                priceMap
            );

            return total + totalFeesInBase24h;
        }, 0);
        // console.log('totalLpFeesInBnUsd24h:', totalLpFeesInUSD24h)
        return totalLpFeesInUSD24h;
    } catch (error) {
        console.error('Error fetching or processing data:', error);
        throw error;
    }
};

// Main function to fetch the 24-hour pool volumes from the Balanced API and convert them to USD value
export const getPoolVolumes_24h = async () => {
    try {
        const bnUsdPrice = await fetchBnUsdPrice();
        const response = await fetch(apiUrl);
        const data = await response.json();

        const priceMap = buildPriceMap(data, bnUsdPrice);

        const totalVolumeInUSD24h = data.reduce((total, pool) => {
            const baseVolume24h = parseFloat(pool.base_volume_24h) || 0;
            const quoteVolume24h = parseFloat(pool.quote_volume_24h) || 0;
            const baseSymbol = pool.base_symbol;

            const totalVolumeInUSD = calculateTotalVolumesInUSD24h(
                baseVolume24h,
                quoteVolume24h,
                baseSymbol,
                priceMap
            );

            return total + totalVolumeInUSD;
        }, 0);

        // console.log('totalVolumeInUSD24h:', totalVolumeInUSD24h);
        return totalVolumeInUSD24h;
    } catch (error) {
        console.error('Error fetching or processing data:', error);
        throw error;
    }
};


