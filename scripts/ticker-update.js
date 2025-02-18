function formatCurrency(value) {
    if (value >= 1e9) {
        return `$ ${(value / 1e9).toFixed(2)}B`;
    } else if (value >= 1e6) {
        return `$ ${(value / 1e6).toFixed(2)}M`;
    } else if (value >= 1e3) {
        return `$ ${(value / 1e3).toFixed(2)}K`;
    }
    return `$ ${value.toFixed(2)}`;
}

function updatePriceCard(symbol, data) {
    if (!data || !data.price) return;
    
    const card = document.querySelector(`.price-card.${symbol.toLowerCase()}`);
    if (!card) return;
    
    const priceElement = card.querySelector('.price');
    const changeElement = card.querySelector('.change');
    const volumeElement = card.querySelector('.volume');
    
    const previousPrice = parseFloat(priceElement.textContent.replace('$', ''));
    const newPrice = +data.price.toFixed(2)
    const formattedPrice = formatCurrency(data.price);

    priceElement.textContent = formattedPrice;
    
    if (previousPrice && newPrice !== previousPrice) {
        priceElement.classList.remove('flash-up', 'flash-down');
        void priceElement.offsetWidth;
        priceElement.classList.add(data.price > previousPrice ? 'flash-up' : 'flash-down');
    }
    
    changeElement.textContent = `${data.change >= 0 ? '+' : ''}${data.change.toFixed(2)}%`;
    changeElement.className = `change ${data.change >= 0 ? 'positive' : 'negative'}`;
    
    const marketCap = data.price * (symbol === 'neo' ? 70_000_000 : 100_000_000);
    card.querySelector('.market-cap').textContent = formatCurrency(marketCap);
    
    if (volumeElement && data.volume) {
        volumeElement.textContent = formatCurrency(data.volume * data.price);
    }
    
    const lastUpdated = document.querySelector('.last-updated');
    if (lastUpdated) {
        lastUpdated.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
    }
}

function updateRatioTicker(ratio) {
    const ratioDisplay = document.getElementById('live-ratio');
    if (ratioDisplay) {
        const oldValue = parseFloat(ratioDisplay.textContent);
        const newValue = +ratio.toFixed(4);
        ratioDisplay.textContent = newValue;
        ratioDisplay.classList.remove('flash-update');
        if (oldValue && newValue !== oldValue) {
            void ratioDisplay.offsetWidth;
            ratioDisplay.classList.add('flash-update');
        }
    }
}