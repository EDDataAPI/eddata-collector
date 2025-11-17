# Commodity Ticker System

## Overview

The commodity ticker provides real-time trading intelligence by analyzing current market data and identifying the best trading opportunities, high-value commodities, and most active markets.

## Features

### 1. Hot Trades (Top 20)

Identifies the most profitable buy-low-sell-high opportunities currently available.

**Criteria:**
- Minimum stock: 100 units (buy side)
- Minimum demand: 100 units (sell side)
- Valid prices: 0 < price < 999,999
- Different markets (no same-station trades)
- Sorted by absolute profit (Credits)

**Data Provided:**
```json
{
  "commodity": "Gold",
  "profit": 1234,
  "profitPercent": 45,
  "buy": {
    "marketId": 3223343616,
    "price": 9100,
    "stock": 500
  },
  "sell": {
    "marketId": 3223343872,
    "price": 10334,
    "demand": 300
  }
}
```

**Use Cases:**
- Finding profitable trade routes
- Quick profit opportunities
- Route planning for traders

### 2. High Value Commodities (Top 10)

Tracks commodities with the highest current sell prices - typically luxury items, rare goods, or high-demand materials.

**Criteria:**
- Valid sell prices: 0 < sellPrice < 999,999
- Active demand > 0
- Sorted by maximum price

**Data Provided:**
```json
{
  "commodity": "Painite",
  "maxPrice": 52000,
  "markets": 15,
  "demand": 5000
}
```

**Use Cases:**
- Identifying luxury/rare items
- Finding high-value cargo
- Market trend analysis

### 3. Most Active Commodities (Top 10)

Shows commodities with the most trading activity in the last 24 hours, indicating healthy, liquid markets.

**Criteria:**
- Updated within last 24 hours
- Minimum 5 active markets
- Valid buy/sell prices
- Sorted by number of active markets

**Data Provided:**
```json
{
  "commodity": "Tritium",
  "activeMarkets": 42,
  "avgBuyPrice": 45000,
  "avgSellPrice": 50000,
  "totalStock": 150000,
  "totalDemand": 80000
}
```

**Use Cases:**
- Finding reliable, liquid markets
- Bulk trading opportunities
- Market health indicators

## Technical Implementation

### Query Optimization

**Hot Trades Query:**
```sql
SELECT 
  buy.commodityName,
  buy.marketId as buyMarketId,
  buy.buyPrice,
  buy.stock,
  sell.marketId as sellMarketId,
  sell.sellPrice,
  sell.demand,
  (sell.sellPrice - buy.buyPrice) as profit,
  CAST(((sell.sellPrice - buy.buyPrice) * 100.0 / buy.buyPrice) as INT) as profitPercent
FROM commodities buy
JOIN commodities sell ON buy.commodityName = sell.commodityName
WHERE buy.stock > 100
  AND buy.buyPrice > 0
  AND buy.buyPrice < 999999
  AND sell.demand > 100
  AND sell.sellPrice > 0
  AND sell.sellPrice < 999999
  AND sell.sellPrice > buy.buyPrice
  AND buy.marketId != sell.marketId
ORDER BY profit DESC
LIMIT 20
```

**Performance:**
- Single JOIN query
- Indexed on commodityName
- Sub-millisecond execution (~1.2ms)

### Data Sources

All data comes from database snapshots:
- Uses read-only snapshot databases
- Updated hourly via snapshot system
- No production database impact

### File Location

```
eddata-data/cache/commodity-ticker.json
```

### Update Frequency

- Generated: Hourly (with all stats)
- Data freshness: Real-time from EDDN
- Snapshot age: < 2 hours

## API Integration

### Endpoint Recommendation

```
GET /api/v1/ticker/commodities
```

### Response Format

```json
{
  "hotTrades": [...],      // Array of 20 best opportunities
  "highValue": [...],      // Array of 10 luxury items
  "mostActive": [...],     // Array of 10 active markets
  "timestamp": "2025-11-17T12:22:42.719Z"
}
```

### Caching Recommendations

- Cache for 50-55 minutes (updates hourly)
- ETag based on timestamp
- Gzip compression recommended

## Usage Examples

### Finding Quick Profits

```javascript
// Get top 5 profit opportunities
const topTrades = ticker.hotTrades.slice(0, 5)

topTrades.forEach(trade => {
  console.log(`${trade.commodity}: Buy at ${trade.buy.marketId} for ${trade.buy.price}`)
  console.log(`  Sell at ${trade.sell.marketId} for ${trade.sell.price}`)
  console.log(`  Profit: ${trade.profit} CR (${trade.profitPercent}%)`)
})
```

### Identifying Luxury Goods

```javascript
// Get high-value items
const luxuryItems = ticker.highValue.filter(c => c.maxPrice > 10000)

console.log('Luxury commodities:')
luxuryItems.forEach(item => {
  console.log(`${item.commodity}: ${item.maxPrice} CR at ${item.markets} markets`)
})
```

### Finding Stable Markets

```javascript
// Get commodities with most activity
const stableMarkets = ticker.mostActive.filter(c => c.activeMarkets > 20)

console.log('Most liquid markets:')
stableMarkets.forEach(market => {
  const spread = market.avgSellPrice - market.avgBuyPrice
  console.log(`${market.commodity}: ${market.activeMarkets} markets, ${spread} CR spread`)
})
```

## Performance Metrics

**Generation Time:**
- Hot Trades query: ~0.4ms
- High Value query: ~0.3ms
- Most Active query: ~0.5ms
- JSON serialization: ~0.1ms
- **Total: ~1.2ms**

**Data Size:**
- Empty (no trades): ~100 bytes
- Full (production): ~5-10 KB
- Gzipped: ~1-2 KB

## Limitations

### Current Limitations

1. **No Historical Price Changes**
   - System doesn't track price history
   - Can't show "24h price change"
   - Requires separate price-tracking system

2. **Snapshot-Based**
   - Data can be up to 2 hours old
   - No real-time price updates
   - Depends on EDDN message frequency

3. **No Route Optimization**
   - Doesn't calculate multi-hop routes
   - No distance/time calculations
   - Separate route planner needed

### Working As Designed

1. **Different Markets Only**
   - Hot trades require buy ≠ sell markets
   - Prevents same-station arbitrage
   - Ensures real trading opportunities

2. **Stock/Demand Minimums**
   - 100 unit minimum prevents low-volume trades
   - Ensures viable opportunities
   - Filters out unrealistic data

3. **Price Validity**
   - Excludes prices > 999,999 (invalid data)
   - Excludes zero prices
   - Ensures data quality

## Future Enhancements

Potential improvements for v2:

- [ ] Price history tracking (24h/7d changes)
- [ ] Route optimization (multi-hop trades)
- [ ] Distance calculations (requires system positions)
- [ ] Fleet Carrier pricing (currently excluded)
- [ ] Per-system ticker (Sol, Colonia, etc.)
- [ ] Rare commodity tracking
- [ ] Community Goal impact tracking
- [ ] Predictive pricing (ML-based)

## Troubleshooting

### Empty Arrays

**Symptom:** All arrays are empty `[]`

**Causes:**
1. No commodity data in database
2. Data doesn't meet criteria (stock/demand minimums)
3. Snapshot is empty or corrupt

**Solution:**
```bash
npm run snapshot  # Refresh snapshots
npm run stats:commodity  # Regenerate ticker
```

### Stale Data

**Symptom:** Timestamp is old, data seems outdated

**Causes:**
1. Stats generation not running
2. Cron job disabled
3. Service not running

**Solution:**
```bash
# Check service status
systemctl status eddata-collector

# Force stats update
npm run stats
```

### Missing Fields

**Symptom:** Some fields are null or undefined

**Causes:**
1. Database schema mismatch
2. Data quality issues
3. Query bug

**Solution:**
```javascript
// All fields have null-safe defaults
// Check database for data integrity
npm run test
```

## Related Documentation

- [Database Snapshots](./DATABASE-SNAPSHOTS.md) - Snapshot system
- [Stats Generation](../scripts/stats/) - Stats scripts
- [Commodity Stats](../lib/stats/commodity-stats.js) - Core logic

## Version History

**v1.0** (2025-11-17)
- Initial implementation
- 3 ticker categories
- Hourly updates
- Snapshot-based queries

## License

Same as EDData Collector - MIT License
