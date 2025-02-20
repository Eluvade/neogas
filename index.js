document.addEventListener('DOMContentLoaded', async function() {
    const chartContainer = document.getElementById('chart-container');
    const dataManager = window.dataManager;

    // Encapsulate chart state
    const chartState = {
        chart: null,
        series: null,
        resizeObserver: null
    };
    
    // Add debounce to timeframe button clicks
    const debounce = (fn, delay) => {
        let timeout;
        return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), delay);
        };
    };

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
            if (chartState.series && e.detail.data && Array.isArray(e.detail.data)) {
                // Filter out null or malformed data points
                const filteredData = e.detail.data.filter(
                    p => p && p.time != null && p.value != null
                );
                if (filteredData.length > 0) {
                    try {
                        chartState.series.setData(filteredData);

                        // Fit content only after the initial data is loaded
                        if (!isInitialDataLoaded) {
                            chartState.chart.timeScale().fitContent();
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
        const percentChange = data.dailyOpenRatio ? 
            ((data.ratio - data.dailyOpenRatio) / data.dailyOpenRatio) * 100 : 
            0;
        updateRatioTicker(data.ratio, percentChange);
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
    
            if (!window.LightweightCharts?.createChart) {
                throw new Error('Chart library failed to load');
              }
    
            chartContainer.style.width = '100%';
            chartContainer.style.position = 'relative';
            chartContainer.style.height = '500px';
    
            chartState.chart = LightweightCharts.createChart(chartContainer, {
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
    
            chartState.series = chartState.chart.addLineSeries({
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

                // Cleanup on unload
            window.addEventListener('beforeunload', () => {
                chartState.resizeObserver?.disconnect();
            });
    
            const resizeChart = () => {
                const width = chartContainer.clientWidth;
                const height = chartContainer.clientHeight;
                chartState.chart.applyOptions({ width, height });
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
                if (!chartState.chart || !chartState.series) {
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
                    chartState.chart.timeScale().fitContent();
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

    // Add click handlers for donation addresses
    document.querySelectorAll('.donation-address').forEach(address => {
        const cryptoAddress = address.querySelector('.crypto-address');
        if (cryptoAddress) {
            cryptoAddress.addEventListener('click', (event) => {
                const text = cryptoAddress.textContent.trim();
                copyToClipboard(text, event);
            });
        }
    });

    // Add click handler to close QR code when clicking overlay
    document.getElementById('modal-overlay').addEventListener('click', () => {
        document.querySelectorAll('.qr-code.visible').forEach(qr => {
            qr.classList.remove('visible');
        });
        document.getElementById('modal-overlay').style.display = 'none';
    });
});

async function toggleDonationCard() {
    const donationCard = document.querySelector('.donation-card');
    const donationFooter = document.querySelector('.donation-footer');
    const donationBody = document.querySelector('.donation-body');
    const overlay = document.getElementById('modal-overlay');

    const listener = e => {
        if (!donationCard.classList.contains('expanded')) {
            document.removeEventListener('keydown', listener);
            document.removeEventListener('click', listener);
            return;
        }
        if (e.key === 'Escape' || !donationCard.contains(e.target)) {
            collapse();
        }
    }

    const collapse = async _ => {
        document.querySelectorAll('.qr-code.visible').forEach(qr => {
            qr.classList.remove('visible');
        });
        overlay.style.display = 'none';
        document.removeEventListener('keydown', listener);
        document.removeEventListener('click', listener);
        await animateCSS(donationBody, 'collapse', 'fast');
        donationBody.classList.remove('expanded');
        donationCard.classList.remove('expanded');
        donationFooter.classList.remove('expanded');
    }

    const expand = async _ => {
        document.addEventListener('click', listener);
        document.addEventListener('keydown', listener);
        donationCard.classList.add('expanded');
        donationBody.classList.add('expanded');
        await animateCSS(donationBody, 'expand', 'fast');
        donationFooter.classList.add('expanded');
    }

    if (donationCard.classList.contains('expanded')) {
        collapse();
    } else {
        expand();
    }

}

function copyToClipboard(text, event) {
    navigator.clipboard.writeText(text).then(() => {
        const donationAddress = event.target.closest('.donation-address');
        const button = donationAddress.querySelector('.copy-button');
        const addressElement = donationAddress.querySelector('.crypto-address');
        
        if (button && addressElement) {
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
    const overlay = document.getElementById('modal-overlay');
    const qrCode = document.getElementById(id);
    
    // Check if this QR code is already visible
    const isCurrentlyVisible = qrCode.classList.contains('visible');
    
    // Hide all visible QR codes
    document.querySelectorAll('.qr-code.visible').forEach(qr => {
        qr.classList.remove('visible');
    });
    
    // If the clicked QR code wasn't visible, show it and the overlay
    if (!isCurrentlyVisible) {
        qrCode.classList.add('visible');
        overlay.style.display = 'block';
    } else {
        // If it was visible, hide it and the overlay
        overlay.style.display = 'none';
    }
}