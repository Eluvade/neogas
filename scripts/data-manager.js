class DataManager {
    constructor() {
        this.cache = new Map();
        this.isLoading = false;
        this.callbacks = new Set();
        this.loadingPromise = null;
    }

    async initialize() {
        if (this.loadingPromise) return this.loadingPromise;
        
        this.loadingPromise = (async () => {
            try {
                this.isLoading = true;
                console.log('Initializing data manager...');
                
                // Start with daily data
                await this.loadTimeframe('1d');
                console.log('Daily data loaded');
                
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
            console.log(`Loading ${interval} data...`);
            const data = await this.fetchKlines(interval);
            this.cache.set(interval, data);
            this.notifyListeners();
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
        setInterval(() => {
            if (!this.isLoading) {
                this.loadTimeframe('1m').catch(console.error);
            }
        }, 60000);
    }

    getData(interval) {
        return this.cache.get(interval) || [];
    }

    onUpdate(callback) {
        this.callbacks.add(callback);
        return () => this.callbacks.delete(callback);
    }

    notifyListeners() {
        this.callbacks.forEach(callback => callback());
    }
}

window.dataManager = new DataManager();
