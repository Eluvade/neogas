document.addEventListener('DOMContentLoaded', async function() {
    const chartContainer = document.getElementById('chart-container');
    const dataManager = window.dataManager;
    let chart, series;

    async function waitForChartLibrary() {
        return new Promise((resolve) => {
            if (window.LightweightCharts) {
                resolve();
            } else {
                window.addEventListener('chartLibraryLoaded', () => resolve());
            }
        });
    }

    async function initializeChart() {
        try {
            await waitForChartLibrary();
            console.log('Creating chart with library version:', window.LightweightCharts.version());

            chartContainer.style.position = 'relative';
            chartContainer.style.height = '500px';

            chart = window.LightweightCharts.createChart(chartContainer, {
                width: chartContainer.clientWidth,
                height: 500,
                layout: {
                    background: { 
                        type: 'solid', 
                        color: getComputedStyle(document.body).getPropertyValue('--color-background').trim() 
                    },
                    textColor: getComputedStyle(document.body).getPropertyValue('--color-text').trim()
                },
                timeScale: {
                    timeVisible: true,
                    secondsVisible: false,
                    rightOffset: 12,
                    barSpacing: 12,
                },
                grid: {
                    vertLines: { visible: false },
                    horzLines: { visible: false }
                },
                rightPriceScale: {
                    borderVisible: false,
                },
                crosshair: {
                    vertLine: {
                        width: 1,
                        style: 1,
                        visible: true,
                        labelVisible: true,
                    },
                    horzLine: {
                        width: 1,
                        style: 1,
                        visible: true,
                        labelVisible: true,
                    },
                },
            });

            series = chart.addAreaSeries({
                lineColor: '#26a69a',
                topColor: 'rgba(38, 166, 154, 0.4)',
                bottomColor: 'rgba(38, 166, 154, 0)',
                lineWidth: 2,
                priceFormat: {
                    type: 'price',
                    precision: 5,
                    minMove: 0.00001,
                },
                lastValueVisible: true,
                priceLineVisible: true,
            });

            window.addEventListener('resize', () => {
                chart.applyOptions({
                    width: chartContainer.clientWidth,
                });
            });

            chart.timeScale().subscribeVisibleLogicalRangeChange(async (range) => {
                if (range && range.from < 10) {
                    const currentTimeframe = dataManager.currentTimeframe;
                    const tfData = dataManager.timeframes.get(currentTimeframe);
                    if (tfData && tfData.data.length > 0) {
                        const oldestBar = tfData.data[0];
                        await dataManager.loadMoreData(currentTimeframe, oldestBar.time * 1000 - 1);
                    }
                }
            });

            return true;
        } catch (error) {
            console.error('Chart initialization failed:', error);
            const errorDiv = document.createElement('div');
            errorDiv.className = 'error-message';
            errorDiv.textContent = 'Failed to initialize chart';
            chartContainer.appendChild(errorDiv);
            return false;
        }
    }

    function initializeTimeframeButtons() {
        const buttons = document.querySelectorAll('.timeframe-button');
        buttons.forEach(button => {
            button.addEventListener('click', async () => {
                if (!chart || !series) {
                    console.error('Chart not initialized');
                    return;
                }

                try {
                    const timeframe = button.dataset.timeframe;
                    button.disabled = true;
                    await dataManager.changeTimeframe(timeframe);
                    
                    buttons.forEach(b => {
                        b.classList.remove('active');
                        b.disabled = false;
                    });
                    button.classList.add('active');
                    
                    chart.timeScale().fitContent();
                } catch (error) {
                    console.error('Failed to change timeframe:', error);
                    button.disabled = false;
                    const errorDiv = document.createElement('div');
                    errorDiv.className = 'error-message';
                    errorDiv.textContent = 'Failed to load timeframe data';
                    chartContainer.appendChild(errorDiv);
                    setTimeout(() => errorDiv.remove(), 3000);
                }
            });
        });
    }

    await dataManager.initialize();
    const chartInitialized = await initializeChart();
    if (chartInitialized) {
        initializeTimeframeButtons();
        
        window.addEventListener('historicalUpdate', (e) => {
            if (series && e.detail.data && Array.isArray(e.detail.data)) {
                try {
                    const areaData = e.detail.data.map(item => ({
                        time: item.time,
                        value: item.close
                    }));
                    series.setData(areaData);
                    chart.timeScale().fitContent();
                } catch (error) {
                    console.error('Failed to update chart data:', error);
                }
            }
        });
    }
    
    dataManager.onPriceUpdate(data => {
        updatePriceCard('neo', data.neo.price, data.neo.change);
        updatePriceCard('gas', data.gas.price, data.gas.change);
        
        const ratioDisplay = document.getElementById('live-ratio');
        if (ratioDisplay) {
            ratioDisplay.textContent = data.ratio.toFixed(4);
        }
    });
});