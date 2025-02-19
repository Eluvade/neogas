/**
 * Animates an HTML element using CSS animations with support for modifiers and callbacks
 * @param {(string|HTMLElement)} element - The element to animate (either element ID string or DOM element)
 * @param {string} animationName - The name of the animation CSS class to apply
 * @param {(string|string[])} [modifier] - Optional CSS class modifier(s) to apply during animation
 * @param {Function} [callback] - Optional callback function to execute after animation completes
 * @returns {Promise} Resolves when the animation completes
 * @example
 * // Animate with single modifier
 * animateCSS('elementId', 'fadeIn', 'fast');
 * 
 * // Animate with multiple modifiers
 * animateCSS(domElement, 'bounce', ['slow', 'delay-1s']);
 * 
 * // Animate with callback
 * animateCSS('elementId', 'slideIn', null, () => console.log('Animation complete'));
 */
function animateCSS(element, animationName, modifier, callback) {
    return new Promise((resolve, reject) => {
      if (Object.prototype.toString.call(element) === '[object String]') {
        element = document.getElementById(element)
        if (!element) {
          reject(new Error('Element not found'))
          return
        }
      } else if (!element || !(element instanceof HTMLElement)) {
        reject(new Error('Invalid element'))
        return
      }
      if (typeof animationName !== 'string' || !animationName) {
        reject(new Error('Animation name must be a non-empty string'))
        return
      }
      element.classList.add('animated', animationName)
      if (Object.prototype.toString.call(modifier) === '[object String]') {
        element.classList.add(modifier)
      } else if (Object.prototype.toString.call(modifier) === '[object Array]') {
        for (let i = 0; i < modifier.length; i++) {
          element.classList.add(modifier[i])
        }
      }
      const eventHandler = _ => {
        element.classList.remove('animated', animationName)
        if (Object.prototype.toString.call(modifier) === '[object String]') {
          element.classList.remove(modifier)
        } else if (Object.prototype.toString.call(modifier) === '[object Array]') {
          for (let i = 0; i < modifier.length; i++) {
            element.classList.remove(modifier[i])
          }
        }
        element.removeEventListener('animationend', eventHandler)
        resolve()
        if (typeof callback === 'function') {
          callback()
        }
      }
      element.addEventListener('animationend', eventHandler)
    })
  }