function updatePriceCard(symbol, price, change) {
    if (!price) return;
    
    const card = document.querySelector(`.price-card.${symbol}`);
    if (!card) return;
    
    const priceElement = card.querySelector('.price');
    const changeElement = card.querySelector('.change');
    
    // Get the previous price from the element
    const previousPrice = parseFloat(priceElement.textContent.replace('$', ''));
    
    // Update price and add animation class
    priceElement.textContent = `$ ${price.toFixed(3)}`;
    
    if (previousPrice) {
        priceElement.classList.remove('flash-up', 'flash-down');
        void priceElement.offsetWidth;
        
        if (price > previousPrice) {
            priceElement.classList.add('flash-up');
        } else if (price < previousPrice) {
            priceElement.classList.add('flash-down');
        }
    }
    
    changeElement.textContent = `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;
    changeElement.className = `change ${change >= 0 ? 'positive' : 'negative'}`;
    
    // Update market cap and volume
    const marketCap = price * (symbol === 'neo' ? 70_000_000 : 100_000_000);
    card.querySelector('.market-cap').textContent = formatCurrency(marketCap);
    
    // Update the global last updated timestamp
    const lastUpdated = document.querySelector('.last-updated');
    if (lastUpdated) {
        lastUpdated.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
    }
}

function formatCurrency(value) {
    if (value >= 1e9) return `$ ${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$ ${(value / 1e6).toFixed(2)}M`;
    if (value >= 1e3) return `$ ${(value / 1e3).toFixed(2)}K`;
    return `$ ${value.toFixed(2)}`;
}