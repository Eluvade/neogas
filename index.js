document.addEventListener('DOMContentLoaded', async function() {
    const chartContainer = document.getElementById('chart-container');
    const dataManager = window.dataManager;

    // 1. Load timeframe from local storage or default to '1d'
    const savedTimeframe = localStorage.getItem('chartTimeframe') || '1d';

    // 2. Set the saved timeframe in DataManager before initialization
    dataManager.setTimeframe(savedTimeframe);

    // 3. Initialize DataManager with the correct timeframe
    await dataManager.initialize();

    // 4. Initialize the chart
    const chartInitialized = await initializeChart();
    if (chartInitialized) {
        initializeTimeframeButtons(savedTimeframe);

        // Flag to track initial data load
        let isInitialDataLoaded = false;

        window.addEventListener('historicalUpdate', (e) => {
            if (series && e.detail.data && Array.isArray(e.detail.data)) {
                // Filter out null or malformed data points
                const filteredData = e.detail.data.filter(
                    p => p && p.time != null && p.value != null
                );
                if (filteredData.length > 0) {
                    try {
                        series.setData(filteredData);

                        // Fit content only after the initial data is loaded
                        if (!isInitialDataLoaded) {
                            chart.timeScale().fitContent();
                            isInitialDataLoaded = true; // Set flag to true after first fit
                        }
                    } catch (error) {
                        console.error('Failed to update chart data:', error);
                    }
                }
            }
        });
    }
    
    dataManager.onPriceUpdate(data => {
        updatePriceCard('neo', data.neo);
        updatePriceCard('gas', data.gas);
        updateRatioTicker(data.ratio);
    });

    async function waitForChartLibrary() {
        return new Promise((resolve, reject) => {
            if (window.LightweightCharts) {
                resolve();
            } else {
                window.addEventListener('chartLibraryLoaded', () => {
                    if (window.LightweightCharts) {
                        resolve();
                    } else {
                        reject(new Error('LightweightCharts library failed to load.'));
                    }
                });
                setTimeout(() => {
                    if (!window.LightweightCharts) {
                        reject(new Error('LightweightCharts library failed to load in time.'));
                    }
                }, 5000);
            }
        });
    }

    async function initializeChart() {
        try {
            await waitForChartLibrary();
    
            if (!window.LightweightCharts || !window.LightweightCharts.createChart) {
                throw new Error('LightweightCharts library is not available.');
            }
    
            chartContainer.style.width = '100%';
            chartContainer.style.position = 'relative';
            chartContainer.style.height = '500px';
    
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
            const errorDiv = document.createElement('div');
            errorDiv.className = 'error-message';
            errorDiv.textContent = 'Failed to initialize the chart. Please refresh the page.';
            chartContainer.appendChild(errorDiv);
            return false;
        }
    }

    function initializeTimeframeButtons(savedTimeframe) {
        const buttons = document.querySelectorAll('.timeframe-button');
        buttons.forEach(button => {
            if (button.dataset.timeframe === savedTimeframe) {
                button.classList.add('active');
            }
            button.addEventListener('click', async () => {
                const timeframe = button.dataset.timeframe;
                if (!chart || !series) {
                    console.error('Chart not initialized');
                    return;
                }
                // Show loading state
                button.disabled = true;
                try {
                    // Change timeframe in data manager
                    await dataManager.changeTimeframe(timeframe);
    
                    // Save selected timeframe to local storage
                    localStorage.setItem('chartTimeframe', timeframe);
    
                    // Update button states
                    buttons.forEach(b => {
                        b.classList.remove('active');
                        b.disabled = false;
                    });
                    button.classList.add('active');
    
                    // Fit content only after changing timeframe
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
});

function toggleDonationCard(event) {
    const donationCard = document.querySelector('.donation-card');
    const donationHeader = document.querySelector('.donation-header');
    const donationBody = document.querySelector('.donation-body');

    if (event && !donationCard.contains(event.target)) {
        // Clicked outside the card, collapse it
        donationBody.classList.remove('expanded');
        donationHeader.classList.remove('expanded');
    } else {
        // Toggle the card
        donationBody.classList.toggle('expanded');
        donationHeader.classList.toggle('expanded');
    }

    // Always hide QR codes when toggling
    document.querySelectorAll('.qr-code.visible').forEach(qr => {
        qr.classList.remove('visible');
    });
}

// Add a click event listener to the document to collapse the card and hide QR codes
document.addEventListener('click', (event) => {
    const donationCard = document.querySelector('.donation-card');
    if (!donationCard.contains(event.target)) {
        toggleDonationCard(event);
        
        // Hide any visible QR codes
        document.querySelectorAll('.qr-code.visible').forEach(qr => {
            qr.classList.remove('visible');
        });
    }
});

function copyToClipboard(text, event) {
    navigator.clipboard.writeText(text).then(() => {
        const button = event.target.closest('.copy-button');
        const addressElement = event.target.closest('.donation-address').querySelector('.crypto-address');
        
        if (button) {
            button.classList.add('copied');
            addressElement.classList.add('copied');
            setTimeout(() => {
                button.classList.remove('copied');
                addressElement.classList.remove('copied');
            }, 500); // Remove feedback after 0.5s
        }
    }).catch((error) => {
        const addressElement = event.target.closest('.donation-address').querySelector('.crypto-address');
        addressElement.classList.add('copy-failed');
        setTimeout(() => addressElement.classList.remove('copy-failed'), 1000); // Remove red border after 1s
    });
}

function toggleQRCode(id) {
    // First hide all other visible QR codes
    document.querySelectorAll('.qr-code.visible').forEach(qr => {
            qr.classList.remove('visible');
    });
    
    // Then toggle the selected QR code
    const qrCode = document.getElementById(id);
    qrCode.classList.toggle('visible');
}