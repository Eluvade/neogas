document.addEventListener('DOMContentLoaded', async function() {
    const chartContainer = document.getElementById('chart-container');
    let currentInterval = '1d';
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
        // Initialize data manager and load initial data
        await window.dataManager.initialize();
        
        // Subscribe to data updates
        window.dataManager.onUpdate(() => {
            const data = window.dataManager.getData(currentInterval);
            if (data && data.length > 0) {
                series.setData(data);
            }
        });

        // Initial chart setup
        const defaultButton = buttonsContainer.querySelector('button:last-child');
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
});