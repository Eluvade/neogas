// Add this function at the top
async function fetchInitialPrices() {
    try {
        const [neoData, gasData] = await Promise.all([
            fetch('https://api.binance.com/api/v3/ticker/price?symbol=NEOUSDT'),
            fetch('https://api.binance.com/api/v3/ticker/price?symbol=GASUSDT')
        ]);
        const neo = await neoData.json();
        const gas = await gasData.json();
        return {
            neo: parseFloat(neo.price),
            gas: parseFloat(gas.price)
        };
    } catch (error) {
        console.error('Error fetching initial prices:', error);
        return null;
    }
}

// Calculate ratio and call onData({ time, value })

// Connect to Binance WebSocket streams for NEOUSDT and GASUSDT
function connectWebSocket(onData) {
    // Get initial prices immediately
    fetchInitialPrices().then(prices => {
        if (prices) {
            neoPrice = prices.neo;
            gasPrice = prices.gas;
            updatePriceCard('neo', prices.neo, neo24hChange);
            updatePriceCard('gas', prices.gas, gas24hChange);
        }
    });

    const ws = new WebSocket('wss://stream.binance.com:9443/ws');
    let neoPrice = null;
    let gasPrice = null;
    let currentCandle = null;
    
    // Add price tracking variables
    let neo24hChange = 0;
    let gas24hChange = 0;
    
    // Get initial 24h change
    fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=NEOUSDT')
        .then(r => r.json())
        .then(data => neo24hChange = parseFloat(data.priceChangePercent));
    fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=GASUSDT')
        .then(r => r.json())
        .then(data => gas24hChange = parseFloat(data.priceChangePercent));
    
    ws.onopen = () => {
        console.log('WebSocket connected');
        ws.send(JSON.stringify({
            method: 'SUBSCRIBE',
            params: [
                'neousdt@trade',
                'gasusdt@trade',
                'neousdt@ticker',
                'gasusdt@ticker'
            ],
            id: 1
        }));
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        // Handle ticker updates (24h price change)
        if (data.e === '24hrTicker') {
            if (data.s === 'NEOUSDT') {
                neo24hChange = parseFloat(data.P);
                updatePriceCard('neo', neoPrice, neo24hChange);
            }
            if (data.s === 'GASUSDT') {
                gas24hChange = parseFloat(data.P);
                updatePriceCard('gas', gasPrice, gas24hChange);
            }
            return;
        }
        
        // Handle trade updates
        if (data.p) {
            const price = parseFloat(data.p);
            const time = Math.floor(data.T / 1000);
            
            if (data.s === 'NEOUSDT') {
                neoPrice = price;
                updatePriceCard('neo', price, neo24hChange);
            }
            if (data.s === 'GASUSDT') {
                gasPrice = price;
                updatePriceCard('gas', price, gas24hChange);
            }
            
            if (neoPrice && gasPrice) {
                const ratio = gasPrice / neoPrice;
                
                if (!currentCandle || time >= currentCandle.time + 60) {
                    if (currentCandle) {
                        onData(currentCandle);
                    }
                    currentCandle = {
                        time,
                        open: ratio,
                        high: ratio,
                        low: ratio,
                        close: ratio,
                        volume: 0
                    };
                } else {
                    currentCandle.high = Math.max(currentCandle.high, ratio);
                    currentCandle.low = Math.min(currentCandle.low, ratio);
                    currentCandle.close = ratio;
                }
            }
        }
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected, reconnecting...');
        setTimeout(() => connectWebSocket(onData), 1000);
    };
}

function updatePriceCard(symbol, price, change) {
    if (!price) return;
    
    const card = document.querySelector(`.price-card.${symbol}`);
    if (!card) return;
    
    const priceElement = card.querySelector('.price');
    const changeElement = card.querySelector('.change');
    
    // Get the previous price from the element
    const previousPrice = parseFloat(priceElement.textContent.replace('$', ''));
    
    // Update price and add animation class
    priceElement.textContent = `$${price.toFixed(3)}`;
    
    if (previousPrice) {
        // Remove existing animation classes
        priceElement.classList.remove('flash-up', 'flash-down');
        
        // Force a reflow to restart animation
        void priceElement.offsetWidth;
        
        // Add new animation class based on price change
        if (price > previousPrice) {
            priceElement.classList.add('flash-up');
        } else if (price < previousPrice) {
            priceElement.classList.add('flash-down');
        }
    }
    
    changeElement.textContent = `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;
    changeElement.className = `change ${change >= 0 ? 'positive' : 'negative'}`;
    
    // Fetch market cap and volume
    fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol.toUpperCase()}USDT`)
        .then(r => r.json())
        .then(data => {
            const marketCap = price * (symbol === 'neo' ? 70_000_000 : 100_000_000); // Updated GAS total supply
            const volume = parseFloat(data.volume) * price;
            
            card.querySelector('.market-cap').textContent = formatCurrency(marketCap);
            card.querySelector('.volume').textContent = formatCurrency(volume);
        });
    
    // Update the global last updated timestamp
    const lastUpdated = document.querySelector('.last-updated');
    if (lastUpdated) {
        lastUpdated.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
    }
}

function formatCurrency(value) {
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
    return `$${value.toFixed(2)}`;
}

// Call Binance REST API for NEOUSDT and GASUSDT historical data, then return ratio data
// Update the function to accept interval parameter
async function getHistoricalPriceData(interval = '1d') {
    const intervals = {
        '1m': '1m',
        '5m': '5m',
        '15m': '15m',
        '1h': '1h',
        '4h': '4h',
        '1d': '1d'
    };

    const binanceInterval = intervals[interval];
    if (!binanceInterval) {
        throw new Error(`Invalid interval: ${interval}`);
    }

    // Maximum limit for Binance API
    const limit = 1000;
    
    try {
        const [neoResponse, gasResponse] = await Promise.all([
            fetch(`https://api.binance.com/api/v3/klines?symbol=NEOUSDT&interval=${binanceInterval}&limit=${limit}`),
            fetch(`https://api.binance.com/api/v3/klines?symbol=GASUSDT&interval=${binanceInterval}&limit=${limit}`)
        ]);

        if (!neoResponse.ok || !gasResponse.ok) {
            throw new Error('API response was not ok');
        }

        const [neoData, gasData] = await Promise.all([
            neoResponse.json(),
            gasResponse.json()
        ]);

        if (!Array.isArray(neoData) || !Array.isArray(gasData) || neoData.length === 0 || gasData.length === 0) {
            throw new Error('Invalid data received from API');
        }

        // Match the data lengths
        const minLength = Math.min(neoData.length, gasData.length);
        const ratioData = [];

        for (let i = 0; i < minLength; i++) {
            const neo = neoData[i];
            const gas = gasData[i];
            
            // Ensure we have valid data points
            if (neo && gas && neo.length >= 6 && gas.length >= 6) {
                ratioData.push({
                    time: neo[0] / 1000, // Convert to seconds
                    open: parseFloat(gas[1]) / parseFloat(neo[1]),
                    high: parseFloat(gas[2]) / parseFloat(neo[2]),
                    low: parseFloat(gas[3]) / parseFloat(neo[3]),
                    close: parseFloat(gas[4]) / parseFloat(neo[4]),
                    volume: parseFloat(gas[5]) // Optional: include volume
                });
            }
        }

        return ratioData;
    } catch (error) {
        console.error('Error fetching historical data:', error);
        throw error;
    }
}

// Make functions globally accessible
window.connectWebSocket = connectWebSocket;
window.getHistoricalPriceData = getHistoricalPriceData;