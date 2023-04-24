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

// Some graphs return a non supported content-type by graphql so success responses are being thrown as errors
export const handle200Errors = (e: any) => {
    const statusCode = e?.response?.status
    if (statusCode >= 200 && statusCode < 300 && typeof e?.response?.error === 'string') {
        return JSON.parse(e.response.error)?.data
    }
    throw e
}

// To get ID for daily data https://docs.uniswap.org/protocol/V2/reference/API/entities
export const getUniswapDateId = (date?: Date) => getUniqStartOfTodayTimestamp(date) / 86400;