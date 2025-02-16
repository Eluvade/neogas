document.addEventListener('DOMContentLoaded', async function() {
    const chartContainer = document.getElementById('chart-container');
    const dataManager = window.dataManager;
    let chart, series;

    async function waitForChartLibrary() {
        return new Promise((resolve, reject) => {
            if (window.LightweightCharts) {
                resolve();
            } else {
                // Listen for the library to load
                window.addEventListener('chartLibraryLoaded', () => {
                    if (window.LightweightCharts) {
                        resolve();
                    } else {
                        reject(new Error('LightweightCharts library failed to load.'));
                    }
                });

                // Set a timeout to handle cases where the library fails to load
                setTimeout(() => {
                    if (!window.LightweightCharts) {
                        reject(new Error('LightweightCharts library failed to load within the expected time.'));
                    }
                }, 5000); // 5-second timeout
            }
        });
    }

    async function initializeChart() {
        try {
            await waitForChartLibrary();

            // Ensure the library is available
            if (!window.LightweightCharts || !window.LightweightCharts.createChart) {
                throw new Error('LightweightCharts library is not available.');
            }

            // Set up the chart container
            chartContainer.style.width = '100%';
            chartContainer.style.position = 'relative';
            chartContainer.style.height = '500px';

            // Create the chart
            chart = LightweightCharts.createChart(chartContainer, {
                width: chartContainer.clientWidth,
                height: 500,
                layout: {
                    background: { 
                        type: 'solid', 
                        color: getComputedStyle(document.body).getPropertyValue('--color-background').trim() 
                    },
                    textColor: getComputedStyle(document.body).getPropertyValue('--color-text').trim(),
                    fontFamily: "'Nunito Sans', sans-serif"
                },
                timeScale: {
                    timeVisible: true,
                    secondsVisible: false,
                    rightOffset: 12,
                    barSpacing: 12,
                    fixLeftEdge: true,
                    lockVisibleTimeRangeOnResize: true
                },
                grid: {
                    vertLines: { color: 'rgba(42, 46, 57, 0.5)' },
                    horzLines: { color: 'rgba(42, 46, 57, 0.5)' }
                },
                rightPriceScale: {
                    borderVisible: false,
                    scaleMargins: {
                        top: 0.1,
                        bottom: 0.1,
                    }
                }
            });

            // Add the line series instead of area series
            series = chart.addLineSeries({
                color: getComputedStyle(document.body).getPropertyValue('--color-primary').trim(),
                lineWidth: 2,
                priceFormat: {
                    type: 'price',
                    precision: 5,
                    minMove: 0.00001,
                },
                crosshairMarkerVisible: true,
                crosshairMarkerRadius: 4,
            });

            // Handle resizing
            const resizeChart = () => {
                const width = chartContainer.clientWidth;
                const height = chartContainer.clientHeight;
                chart.applyOptions({ width, height });
            };
            const resizeObserver = new ResizeObserver(resizeChart);
            resizeObserver.observe(chartContainer);

            return true;
        } catch (error) {
            console.error('Chart initialization failed:', error);

            // Display an error message to the user
            const errorDiv = document.createElement('div');
            errorDiv.className = 'error-message';
            errorDiv.textContent = 'Failed to initialize the chart. Please refresh the page or check your internet connection.';
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
                    // The data is already in the correct format now
                    series.setData(e.detail.data);
                    chart.timeScale().fitContent();
                } catch (error) {
                    console.error('Failed to update chart data:', error);
                }
            }
        });
    }
    
    dataManager.onPriceUpdate(data => {
        updatePriceCard('neo', data.neo);
        updatePriceCard('gas', data.gas);
        
        const ratioDisplay = document.getElementById('live-ratio');
        if (ratioDisplay) {
            const oldValue = parseFloat(ratioDisplay.textContent);
            ratioDisplay.textContent = data.ratio.toFixed(4);
            
            ratioDisplay.classList.remove('flash-update');
            if (oldValue && data.ratio !== oldValue) {
                void ratioDisplay.offsetWidth;
                ratioDisplay.classList.add('flash-update');
            }
        }
    });
});