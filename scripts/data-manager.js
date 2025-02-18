class DataManager {
    constructor() {
        this.callbacks = new Set();
        this.ws = null;
        this.neoPrice = null;
        this.gasPrice = null;
        this.ratioPercentChange = 0;
        this.neo24hChange = 0;
        this.gas24hChange = 0;
        this.currentCandle = null;
        this.timeframes = new Map();
        this.currentTimeframe = '1d';
        this.timeframeIntervals = {
            '1m': 60,
            '5m': 300,
            '15m': 900,
            '1h': 3600,
            '4h': 14400,
            '1d': 86400
        };
        this.wsConnected = false;
        this.wsReconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.isLoadingHistoricalData = false;
        this.neoVolume = 0;
        this.gasVolume = 0;
        this.dailyOpenRatio = null;
    }

    async initialize() {
        await this.fetchInitialData();
        await this.loadTimeframe(this.currentTimeframe);
        this.connectWebSocket();
    }

    async fetchInitialData() {
        try {
            const [neoData, gasData] = await Promise.all([
                fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=NEOUSDT'),
                fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=GASUSDT')
            ]);
            
            const neo = await neoData.json();
            const gas = await gasData.json();
            this.neoPrice = parseFloat(neo.lastPrice);
            this.gasPrice = parseFloat(gas.lastPrice);
            this.neo24hChange = parseFloat(neo.priceChangePercent);
            this.gas24hChange = parseFloat(gas.priceChangePercent);
            this.ratioPercentChange = this.gas24hChange - this.neo24hChange;
            this.neoVolume = parseFloat(neo.volume);
            this.gasVolume = parseFloat(gas.volume);
            
            // Calculate daily open ratio using 24h changes
            const neoOpen = this.neoPrice / (1 + (this.neo24hChange / 100));
            const gasOpen = this.gasPrice / (1 + (this.gas24hChange / 100));
            this.dailyOpenRatio = gasOpen / neoOpen;

            this.notifyPriceUpdate();
        } catch (error) {
            console.error('Error fetching initial data:', error);
        }
    }

    setTimeframe(timeframe) {
        if (this.timeframeIntervals[timeframe]) {
            this.currentTimeframe = timeframe;
        } else {
            console.warn(`Invalid timeframe: ${timeframe}. Using default '1d'.`);
            this.currentTimeframe = '1d';
        }
    }

    async loadTimeframe(timeframe) {
        if (this.timeframes.has(timeframe)) {
            const tfData = this.timeframes.get(timeframe);
            if (tfData.initialLoad) return tfData.data;
        }

        const maxPages = 4;
        let allNeoData = [];
        let allGasData = [];
        let endTime = Date.now();
        
        try {
            for (let page = 0; page < maxPages; page++) {
                const [neoKlines, gasKlines] = await Promise.all([
                    fetch(`https://api.binance.com/api/v3/klines?symbol=NEOUSDT&interval=${timeframe}&limit=1000&endTime=${endTime}`),
                    fetch(`https://api.binance.com/api/v3/klines?symbol=GASUSDT&interval=${timeframe}&limit=1000&endTime=${endTime}`)
                ]);

                const neoData = await neoKlines.json();
                const gasData = await gasKlines.json();

                if (!neoData.length || !gasData.length) break;

                allNeoData = [...neoData, ...allNeoData];
                allGasData = [...gasData, ...allGasData];

                // Update endTime for next page (use oldest timestamp - 1)
                const oldestTimestamp = Math.min(
                    neoData[0][0],
                    gasData[0][0]
                );
                endTime = oldestTimestamp - 1;
            }

            // Remove duplicates using timestamp as key
            const uniqueData = new Map();
            const processedData = this.processHistoricalData(allNeoData, allGasData);
            
            processedData.forEach(bar => {
                uniqueData.set(bar.time, bar);
            });

            const finalData = Array.from(uniqueData.values())
                .sort((a, b) => a.time - b.time);

            this.timeframes.set(timeframe, { data: finalData, initialLoad: true });
            this.notifyHistoricalUpdate();
            return finalData;
        } catch (error) {
            console.error(`Error loading ${timeframe} timeframe:`, error);
            return [];
        }
    }

    async loadMoreData(timeframe, endTime) {
        const tfData = this.timeframes.get(timeframe);
        if (!tfData || this.isLoadingHistoricalData) return;

        this.isLoadingHistoricalData = true;
        try {
            const [neoKlines, gasKlines] = await Promise.all([
                fetch(`https://api.binance.com/api/v3/klines?symbol=NEOUSDT&interval=${timeframe}&limit=1000&endTime=${endTime}`),
                fetch(`https://api.binance.com/api/v3/klines?symbol=GASUSDT&interval=${timeframe}&limit=1000&endTime=${endTime}`)
            ]);

            const neoData = await neoKlines.json();
            const gasData = await gasKlines.json();
            const newBars = this.processHistoricalData(neoData, gasData);

            if (newBars.length > 0) {
                tfData.data = [...newBars, ...tfData.data];
                this.notifyHistoricalUpdate();
            }
        } catch (error) {
            console.error('Error loading more data:', error);
        } finally {
            this.isLoadingHistoricalData = false;
        }
    }

    processHistoricalData(neoData, gasData) {
        const neoMap = new Map(neoData.map(neo => [neo[0], parseFloat(neo[4])]));
        const gasMap = new Map(gasData.map(gas => [gas[0], parseFloat(gas[4])]));
    
        const allTimestamps = new Set([...neoMap.keys(), ...gasMap.keys()]);
        const bars = [];
    
        Array.from(allTimestamps).sort((a, b) => a - b).forEach(timestamp => {
            const neoClose = neoMap.get(timestamp);
            const gasClose = gasMap.get(timestamp);
            if (neoClose !== undefined && gasClose !== undefined) {
                bars.push({
                    time: Math.floor(timestamp / 1000), // Convert ms to seconds
                    value: gasClose / neoClose
                });
            }
        });
    
        return bars;
    }

    connectWebSocket() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        console.log('Connecting to WebSocket...');
        this.ws = new WebSocket('wss://stream.binance.com:9443/ws');

        this.ws.onopen = () => {
            console.log('WebSocket connected');
            this.wsConnected = true;
            this.wsReconnectAttempts = 0;
            
            // Subscribe to streams
            const msg = JSON.stringify({
                method: 'SUBSCRIBE',
                params: [
                    'neousdt@trade',
                    'gasusdt@trade',
                    'neousdt@ticker',
                    'gasusdt@ticker'
                ],
                id: 1
            });
            
            console.log('Subscribing to streams:', msg);
            this.ws.send(msg);
            
            // Update status
            this.updateConnectionStatus(true);
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleWebSocketMessage(data);
            } catch (error) {
                console.error('WS message handling error:', error);
            }
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.wsConnected = false;
            this.updateConnectionStatus(false);
        };

        this.ws.onclose = () => {
            console.log('WebSocket disconnected');
            this.wsConnected = false;
            this.updateConnectionStatus(false);

            // Implement exponential backoff
            if (this.wsReconnectAttempts < this.maxReconnectAttempts) {
                const delay = Math.min(1000 * Math.pow(2, this.wsReconnectAttempts), 30000);
                this.wsReconnectAttempts++;
                console.log(`Reconnecting in ${delay}ms (attempt ${this.wsReconnectAttempts})`);
                setTimeout(() => this.connectWebSocket(), delay);
            } else {
                console.error('Max reconnection attempts reached');
            }
        };
    }

    updateConnectionStatus(connected) {
        const status = document.querySelector('.last-updated');
        if (status) {
            status.textContent = connected ? 
                `Connected - Last updated: ${new Date().toLocaleTimeString()}` :
                'Disconnected - Attempting to reconnect...';
            status.className = `last-updated ${connected ? 'connected' : 'disconnected'}`;
        }
    }

    handleWebSocketMessage(data) {
        if (data.e === '24hrTicker') {
            this.handle24hTicker(data);
        } else if (data.e === 'trade') {
            this.handleTrade(data);
        }
        this.notifyPriceUpdate();
    }

    handle24hTicker(data) {
        if (data.s === 'NEOUSDT') {
            this.neo24hChange = parseFloat(data.P);
        } else if (data.s === 'GASUSDT') {
            this.gas24hChange = parseFloat(data.P);
        }
        this.notifyPriceUpdate();
    }

    handleTrade(data) {
        const price = parseFloat(data.p);
        const time = Math.floor(data.T / 1000);

        if (data.s === 'NEOUSDT') {
            this.neoPrice = price;
        } else if (data.s === 'GASUSDT') {
            this.gasPrice = price;
        }

        if (this.neoPrice && this.gasPrice) {
            const ratio = this.gasPrice / this.neoPrice;
            this.updateCurrentCandle(time, ratio);
            this.updateCurrentTimeframe(ratio, time);
            this.notifyPriceUpdate();
        }
    }

    updateCurrentCandle(time, ratio) {
        const interval = this.timeframeIntervals[this.currentTimeframe] || 60;
        if (!this.currentCandle || time >= this.currentCandle.time + interval) {
            if (this.currentCandle) {
                const tfData = this.timeframes.get(this.currentTimeframe);
                if (tfData) {
                    tfData.data.push(this.currentCandle);
                    this.notifyHistoricalUpdate();
                }
            }
            this.currentCandle = {
                time,
                open: ratio,
                high: ratio,
                low: ratio,
                close: ratio
            };
        } else {
            this.currentCandle.high = Math.max(this.currentCandle.high, ratio);
            this.currentCandle.low = Math.min(this.currentCandle.low, ratio);
            this.currentCandle.close = ratio;
        }
    }

    updateCurrentTimeframe(ratio, timestamp) {
        const interval = this.timeframeIntervals[this.currentTimeframe];
        const normalizedTime = Math.floor(timestamp / interval) * interval;

        const tfData = this.timeframes.get(this.currentTimeframe);
        if (!tfData) return;

        let data = tfData.data;
        let lastBar = data[data.length - 1];

        if (!lastBar || lastBar.time < normalizedTime) {
            // Create new bar
            lastBar = {
                time: normalizedTime,
                value: ratio // Changed from OHLC to simple value for area series
            };
            data.push(lastBar);
        } else {
            // Update existing bar
            lastBar.value = ratio; // Just update the value
        }

        this.notifyHistoricalUpdate();
    }

    getData(timeframe = null) {
        const tf = timeframe || this.currentTimeframe;
        const tfData = this.timeframes.get(tf);
        return tfData ? tfData.data : [];
    }

    async changeTimeframe(timeframe) {
        if (!this.timeframeIntervals[timeframe]) {
            throw new Error(`Invalid timeframe: ${timeframe}`);
        }

        try {
            this.currentTimeframe = timeframe;
            await this.loadTimeframe(timeframe);
            this.notifyHistoricalUpdate();
        } catch (error) {
            console.error(`Error changing timeframe: ${error.message}`);
            this.currentTimeframe = '1d';
            this.notifyHistoricalUpdate();
        }
    }

    onPriceUpdate(callback) {
        this.callbacks.add(callback);
        return () => this.callbacks.delete(callback);
    }

    notifyPriceUpdate() {
        const data = {
            neo: { 
                price: this.neoPrice, 
                change: this.neo24hChange,
                volume: this.neoVolume 
            },
            gas: { 
                price: this.gasPrice, 
                change: this.gas24hChange,
                volume: this.gasVolume
            },
            ratio: this.gasPrice / this.neoPrice,
            dailyOpenRatio: this.dailyOpenRatio
        };
        this.callbacks.forEach(callback => callback(data));
    }

    notifyHistoricalUpdate() {
        const data = this.getData();
        window.dispatchEvent(new CustomEvent('historicalUpdate', {
            detail: { data }
        }));
    }
}

window.dataManager = new DataManager();