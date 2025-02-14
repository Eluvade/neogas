class DataManager {
    constructor() {
        this.cache = new Map();
        this.isLoading = false;
        this.callbacks = new Set();
        this.loadingPromise = null;
        this.currentPrices = {
            neo: null,
            gas: null
        };
        this.previousRatio = null;
    }

    async initialize() {
        if (this.loadingPromise) return this.loadingPromise;
        
        // Fetch current prices immediately
        this.fetchCurrentPrices();
        
        this.loadingPromise = (async () => {
            try {
                this.isLoading = true;
                console.log('Initializing data manager...');
                
                // Start with daily data
                await this.loadTimeframe('1d');
                
                // Load other timeframes in background
                this.loadOtherTimeframes();
                
                // Start real-time updates
                this.startRealtimeUpdates();
            } catch (error) {
                console.error('Failed to initialize:', error);
                throw error;
            } finally {
                this.isLoading = false;
            }
        })();

        return this.loadingPromise;
    }

    async loadTimeframe(interval) {
        try {
            const data = await this.fetchKlines(interval);
            this.cache.set(interval, data);
            this.notifyListeners({
                type: 'klines',
                interval: interval,
                data: data
            });
            return data;
        } catch (error) {
            console.error(`Error loading ${interval} data:`, error);
            throw error;
        }
    }

    async fetchKlines(interval) {
        const [neoData, gasData] = await Promise.all([
            fetch(`https://api.binance.com/api/v3/klines?symbol=NEOUSDT&interval=${interval}&limit=1000`)
                .then(r => r.json()),
            fetch(`https://api.binance.com/api/v3/klines?symbol=GASUSDT&interval=${interval}&limit=1000`)
                .then(r => r.json())
        ]);

        return this.processKlines(neoData, gasData);
    }

    processKlines(neoData, gasData) {
        const minLength = Math.min(neoData.length, gasData.length);
        return Array.from({length: minLength}, (_, i) => {
            const neo = neoData[i];
            const gas = gasData[i];
            return {
                time: neo[0] / 1000,
                open: parseFloat(gas[1]) / parseFloat(neo[1]),
                high: parseFloat(gas[2]) / parseFloat(neo[2]),
                low: parseFloat(gas[3]) / parseFloat(neo[3]),
                close: parseFloat(gas[4]) / parseFloat(neo[4]),
                volume: parseFloat(gas[5])
            };
        });
    }

    async loadOtherTimeframes() {
        const timeframes = ['1m', '5m', '15m', '1h', '4h'];
        for (const interval of timeframes) {
            await this.loadTimeframe(interval).catch(console.error);
        }
    }

    startRealtimeUpdates() {
        // Update current prices every 5 seconds
        setInterval(() => {
            if (!this.isLoading) {
                this.fetchCurrentPrices();
            }
        }, 5000);

        // Update timeframe data every minute
        setInterval(() => {
            if (!this.isLoading) {
                this.loadTimeframe('1m').catch(console.error);
            }
        }, 60000);
    }

    updatePrice(token, price) {
        this.currentPrices[token] = price;
        
        if (this.currentPrices.neo && this.currentPrices.gas) {
            const ratio = this.currentPrices.gas / this.currentPrices.neo;
            const percentChange = this.previousRatio 
                ? ((ratio - this.previousRatio) / this.previousRatio) * 100 
                : 0;
            
            this.notifyListeners({
                type: 'price',
                token,
                price,
                ratio,
                percentChange
            });
            
            this.previousRatio = ratio;
        } else {
            this.notifyListeners({
                type: 'price',
                token,
                price
            });
        }
    }

    async fetchCurrentPrices() {
        try {
            const [neoPrice, gasPrice] = await Promise.all([
                fetch('https://api.binance.com/api/v3/ticker/price?symbol=NEOUSDT')
                    .then(r => r.json()),
                fetch('https://api.binance.com/api/v3/ticker/price?symbol=GASUSDT')
                    .then(r => r.json())
            ]);
            
            this.updatePrice('neo', parseFloat(neoPrice.price));
            this.updatePrice('gas', parseFloat(gasPrice.price));
            
            return this.currentPrices;
        } catch (error) {
            console.error('Error fetching current prices:', error);
            return null;
        }
    }

    getData(interval) {
        return this.cache.get(interval) || [];
    }

    onUpdate(callback) {
        this.callbacks.add(callback);
        return () => this.callbacks.delete(callback);
    }

    notifyListeners(update) {
        this.callbacks.forEach(callback => {
            try {
                callback(update);
            } catch (error) {
                console.error('Error in update callback:', error);
            }
        });
    }
}

window.dataManager = new DataManager();
