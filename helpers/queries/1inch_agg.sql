SELECT
    split_part(upper(blockchain), '_', 1) as blockchain,
    sum(amount_usd) as volume_24h
FROM oneinch.swaps
WHERE
    (protocol = 'AR' OR flags['second_side'])
    AND TIME_RANGE
GROUP BY 1
ORDER BY volume_24h DESC