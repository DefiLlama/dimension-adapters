export const getUniqStartOfTodayTimestamp = (date = new Date()) => {
    var date_utc = Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        date.getUTCHours(),
        date.getUTCMinutes(),
        date.getUTCSeconds()
    );
    var startOfDay = new Date(date_utc);
    var timestamp = startOfDay.getTime() / 1000;
    return Math.floor(timestamp / 86400) * 86400;
};

// To get ID for daily data https://docs.uniswap.org/protocol/V2/reference/API/entities
export const getUniswapDateId = (date?: Date) => getUniqStartOfTodayTimestamp(date) / 86400;