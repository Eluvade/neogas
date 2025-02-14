document.addEventListener('DOMContentLoaded', async function() {
    const chartContainer = document.getElementById('chart-container');
    
    // Get saved timeframe from localStorage or use default
    let currentInterval = localStorage.getItem('selectedTimeframe') || '1d';
    let series;
    
    // Add data cache
    const dataCache = new Map();
    
    const intervals = ['1m', '5m', '15m', '1h', '4h', '1d'];
    const intervalColors = {
        '1m': '#2962FF',
        '5m': '#E1575A',
        '15m': '#F28E2C',
        '1h': '#A459D1',
        '4h': '#54B435',
        '1d': '#FF6B6B'
    };

    // Create loading indicator
    const loadingIndicator = document.createElement('div');
    loadingIndicator.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 1.2em;
        color: var(--color-text);
    `;
    loadingIndicator.textContent = 'Loading chart data...';
    chartContainer.appendChild(loadingIndicator);

    // Create chart
    const chart = LightweightCharts.createChart(chartContainer, {
        width: chartContainer.clientWidth || 800,
        height: chartContainer.clientHeight || 500,
        layout: {
            background: { 
                type: 'solid', 
                color: getComputedStyle(document.body).getPropertyValue('--color-background').trim() 
            },
            textColor: getComputedStyle(document.body).getPropertyValue('--color-text').trim()
        },
        grid: {
            vertLines: { visible: false },
            horzLines: { visible: false }
        },
        timeScale: {
            timeVisible: true,
            secondsVisible: false,
        }
    });
    
    series = chart.addSeries(LightweightCharts.CandlestickSeries, {
        upColor: intervalColors[currentInterval],
        downColor: getComputedStyle(document.body).getPropertyValue('--color-secondary').trim(),
        borderVisible: false,
        wickUpColor: intervalColors[currentInterval],
        wickDownColor: getComputedStyle(document.body).getPropertyValue('--color-secondary').trim(),
        priceFormat: {
            type: 'custom',
            formatter: value => value.toFixed(6),
        },
    });

    async function setChartInterval(interval, button) {
        if (interval === currentInterval) return;
        
        // Update button states
        document.querySelectorAll('#chart-container button').forEach(btn => {
            btn.classList.remove('active');
            btn.disabled = true;
        });
        button.classList.add('active');

        try {
            loadingIndicator.style.display = 'block';
            let data = window.dataManager.getData(interval);
            
            // If no data, try loading it
            if (!data || data.length === 0) {
                await window.dataManager.loadTimeframe(interval);
                data = window.dataManager.getData(interval);
            }

            if (data && data.length > 0) {
                currentInterval = interval;
                // Save selected timeframe to localStorage
                localStorage.setItem('selectedTimeframe', interval);
                
                series.setData(data);
                series.applyOptions({
                    upColor: intervalColors[interval],
                    wickUpColor: intervalColors[interval],
                });
                chart.timeScale().fitContent();
            } else {
                throw new Error('No data available');
            }
        } catch (error) {
            console.error('Failed to load interval:', interval, error);
            button.classList.remove('active');
            alert(`Failed to load ${interval} data. Please try again.`);
        } finally {
            document.querySelectorAll('#chart-container button').forEach(btn => {
                btn.disabled = false;
            });
            loadingIndicator.style.display = 'none';
        }
    }

    // Create interval buttons with loading states
    const buttonsContainer = document.createElement('div');
    buttonsContainer.style.position = 'absolute';
    buttonsContainer.style.top = '10px';
    buttonsContainer.style.right = '10px';
    buttonsContainer.style.zIndex = '1000';

    intervals.forEach(interval => {
        const button = document.createElement('button');
        button.innerText = interval.toUpperCase();
        button.style.marginLeft = '4px';
        if (interval === currentInterval) {
            button.classList.add('active');
        }
        button.addEventListener('click', () => setChartInterval(interval, button));
        buttonsContainer.appendChild(button);
    });

    chartContainer.style.position = 'relative';
    chartContainer.appendChild(buttonsContainer);

    // Window resize handler
    window.addEventListener('resize', () => {
        chart.applyOptions({
            width: chartContainer.clientWidth,
            height: chartContainer.clientHeight
        });
    });

    try {
        await window.dataManager.initialize();
        
        window.dataManager.onUpdate(() => {
            const data = window.dataManager.getData(currentInterval);
            if (data && data.length > 0) {
                series.setData(data);
            }
        });

        // Find the button matching the saved interval using Array.from and find
        const savedButton = Array.from(buttonsContainer.querySelectorAll('button'))
            .find(btn => btn.innerText === currentInterval.toUpperCase());
        const defaultButton = savedButton || buttonsContainer.querySelector('button:last-child');
        await setChartInterval(currentInterval, defaultButton);
        loadingIndicator.style.display = 'none';
    } catch (error) {
        console.error('Failed to initialize chart:', error);
        loadingIndicator.textContent = 'Failed to load chart data. Please refresh the page.';
    }

    // WebSocket connection for real-time updates
    connectWebSocket(latestRatio => {
        series.update(latestRatio);
    });

    // Price update handlers
    const gasPrice = document.querySelector('.gas .price');
    const neoPrice = document.querySelector('.neo .price');
    const ratioDisplay = document.getElementById('live-ratio');
    let currentPrices = { gas: null, neo: null };
    
    function updatePrice(element, price, token) {
        element.textContent = `$ ${price.toFixed(2)}`;
        element.classList.remove('flash-update');
        void element.offsetWidth; // Force reflow
        element.classList.add('flash-update');
        
        // Store current price
        currentPrices[token] = price;
        
        // Calculate and update ratio if both prices are available
        if (currentPrices.gas !== null && currentPrices.neo !== null) {
            const newRatio = currentPrices.gas / currentPrices.neo;
            const previousRatio = parseFloat(ratioDisplay.textContent);
            const percentChange = previousRatio ? ((newRatio - previousRatio) / previousRatio) * 100 : 0;
            updateRatio(newRatio, percentChange);
        }
    }

    function updateRatio(ratio, percentChange) {
        const formattedRatio = ratio.toFixed(4);
        const arrow = percentChange >= 0 ? '▲' : '▼';
        const formattedChange = Math.abs(percentChange).toFixed(2);
        // Update ratio display
        ratioDisplay.textContent = formattedRatio;
        ratioDisplay.classList.remove('flash-update');
        void ratioDisplay.offsetWidth;
        ratioDisplay.classList.add('flash-update');
        
        // Update document title
        document.title = `GASNEO ${formattedRatio} ${arrow} ${formattedChange}% Ratio Ticker`;
    }

    // Update subscription handler
    window.dataManager.onUpdate(update => {
        if (update.type === 'initial_prices' || update.type === 'prices') {
            // Handle initial load and bulk price updates
            updatePrice(gasPrice, update.gas, 'gas');
            updatePrice(neoPrice, update.neo, 'neo');
            // Force immediate ratio update
            updateRatio(update.ratio, update.percentChange);
        }
        else if (update.type === 'price') {
            // Handle single price update
            if (update.token === 'gas') {
                updatePrice(gasPrice, update.price, 'gas');
            } else if (update.token === 'neo') {
                updatePrice(neoPrice, update.price, 'neo');
            }
        } else if (update.type === 'klines' && update.interval === currentInterval) {
            series.setData(update.data);
        }
    });

    // Initialize immediately
    window.dataManager.initialize();
});