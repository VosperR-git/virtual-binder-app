/* --- START OF FILE script.js --- */

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const generatorForm = document.getElementById('generator-form');
    const totalSlotsInput = document.getElementById('total-slots-input');
    const binder = document.getElementById('binder');
    const prevButton = document.getElementById('prev-button');
    const nextButton = document.getElementById('next-button');
    const homeButton = document.getElementById('home-button'); 
    const slideCounter = document.getElementById('slide-counter');
    const errorMessage = document.getElementById('error-message');
    const searchForm = document.getElementById('search-form');
    const searchInput = document.getElementById('search-input');
    const searchButton = document.getElementById('search-button');
    const themeSwitcher = document.getElementById('theme-switcher');
    const infoModal = document.getElementById('info-modal');
    const infoCard = document.getElementById('info-card');
    const collectionLinkInput = document.getElementById('collection-link');
    const copyLinkBtn = document.getElementById('copy-link-btn');
    const autocompleteSuggestions = document.getElementById('autocomplete-suggestions'); // --- NEW ---

    // --- App State ---
    let state = {
        totalSlots: 0, totalPages: 0, totalSlides: 0, currentSlideIndex: 0,
        slotsPerPage: 16,
        totalAvailablePokemon: 0,
        caughtPokemon: new Set(),
    };
    let longPressTimer = null;
    let longPressHandled = false;
    let activeHoldSlot = null;
    let activeSuggestionIndex = -1; // --- NEW ---
    
    // --- Constants ---
    const LONG_PRESS_DURATION = 500;
    const POKE_API_BASE_URL = 'https://pokeapi.co/api/v2/pokemon/';
    const MAX_CONCURRENT = 75;
    const TYPE_COLORS = { normal: '#A8A878', fire: '#F08030', water: '#6890F0', grass: '#78C850', electric: '#F8D030', ice: '#98D8D8', fighting: '#C03028', poison: '#A040A0', ground: '#E0C068', flying: '#A890F0', psychic: '#F85888', bug: '#A8B820', rock: '#B8A038', ghost: '#705898', dragon: '#7038F8', dark: '#705848', steel: '#B8B8D0', fairy: '#EE99AC' };
    const GENERATION_NAMES = { 'generation-i': 'Red/Blue/Yellow', 'generation-ii': 'Gold/Silver/Crystal', 'generation-iii': 'Ruby/Sapphire/Emerald', 'generation-iv': 'Diamond/Pearl/Platinum', 'generation-v': 'Black/White', 'generation-vi': 'X/Y', 'generation-vii': 'Sun/Moon', 'generation-viii': 'Sword/Shield', 'generation-ix': 'Scarlet/Violet' };
    
    // --- API & QUEUE MANAGEMENT ---
    const pokemonCache = new Map();
    const pokemonDetailCache = new Map();
    const pokemonNameIdMap = new Map();
    const requestQueue = new Set();
    const processing = new Set();
    const preloadedImageUrls = new Set();

    // --- Helper Functions ---
    function lightenColor(hex, percent) {
        let r = parseInt(hex.substring(1, 3), 16);
        let g = parseInt(hex.substring(3, 5), 16);
        let b = parseInt(hex.substring(5, 7), 16);
        r = Math.min(255, r + (255 * (percent / 100)));
        g = Math.min(255, g + (255 * (percent / 100)));
        b = Math.min(255, b + (255 * (percent / 100)));
        return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
    }

    // --- THEME SWITCHER ---
    function applyTheme(theme) {
        if (!['light', 'dark', 'retro'].includes(theme)) { theme = 'retro'; }
        document.documentElement.setAttribute('data-theme', theme);
        themeSwitcher.querySelectorAll('button').forEach(btn => btn.classList.toggle('active', btn.dataset.theme === theme));
    }
    function initTheme() {
        applyTheme(localStorage.getItem('binderTheme') || 'retro');
    }
    themeSwitcher.addEventListener('click', (e) => {
        const target = e.target.closest('button');
        if (target && target.dataset.theme) {
            localStorage.setItem('binderTheme', target.dataset.theme);
            applyTheme(target.dataset.theme);
        }
    });

    // --- Event Listeners ---
    generatorForm.addEventListener('submit', (e) => {
        e.preventDefault();
        generateBinder(parseInt(totalSlotsInput.value, 10));
    });
    searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        searchForSlot();
    });

    // --- NEW/MODIFIED: Autocomplete and Search Input Listeners ---
    searchInput.addEventListener('input', handleAutocomplete);
    searchInput.addEventListener('keydown', handleAutocompleteKeys);
    searchInput.addEventListener('blur', () => {
        // Delay hiding to allow click on suggestion to register
        setTimeout(() => hideAutocomplete(), 150);
    });

    prevButton.addEventListener('click', () => navigate(-1));
    nextButton.addEventListener('click', () => navigate(1));
    homeButton.addEventListener('click', () => navigateToHome());

    document.addEventListener('keydown', handleKeyPress);

// SHORT press = CATCH
binder.addEventListener('click', (e) => {
    if (longPressHandled) {
        e.preventDefault(); // prevent triggering after long press
        return;
    }
    const slot = e.target.closest('.slot.is-loaded');
    if (slot) {
        const pokemonId = parseInt(slot.id.split('-')[1], 10);
        toggleCatch(pokemonId);
        slot.classList.toggle('caught', state.caughtPokemon.has(pokemonId));
        // Optional: quick animation
        slot.classList.add('catch-feedback');
        slot.addEventListener('animationend', () => slot.classList.remove('catch-feedback'), { once: true });
    }
});


function handlePressStart(e) {
  const slot = e.target.closest('.slot.is-loaded');
  if (!slot) return;

  longPressHandled = false;
  activeHoldSlot = slot;
  slot.classList.add('slot-holding');

  longPressTimer = setTimeout(() => {
    if (activeHoldSlot) {
      longPressHandled = true;
      showInfoCard(slot.id.split('-')[1]);
    }
  }, LONG_PRESS_DURATION);
}
    
function handlePressEnd(e) {
  clearTimeout(longPressTimer);

  if (activeHoldSlot) {
    activeHoldSlot.classList.remove('slot-holding');
    activeHoldSlot.style.transform = '';
    activeHoldSlot.style.boxShadow = '';
    activeHoldSlot = null;
  }
}

    
binder.addEventListener('mousedown', handlePressStart);
binder.addEventListener('mouseup', handlePressEnd);
binder.addEventListener('mouseleave', handlePressEnd);
binder.addEventListener('touchstart', handlePressStart, { passive: true });
binder.addEventListener('touchend', handlePressEnd);
binder.addEventListener('touchcancel', handlePressEnd);


    infoModal.addEventListener('click', (e) => {
        if (e.target === infoModal) hideInfoCard();
    });

    copyLinkBtn.addEventListener('click', generateAndCopyShareLink);

    // --- NEW: Autocomplete Functions ---
    function handleAutocomplete() {
        errorMessage.style.display = 'none';
        const query = searchInput.value.trim().toLowerCase();

        if (query.length < 1) {
            hideAutocomplete();
            return;
        }

        // --- MODIFIED LOGIC ---
        // Instead of filtering all names, we'll build a list of suggestions
        // that are valid for the current binder size.
        const suggestions = [];
        for (const [name, id] of pokemonNameIdMap.entries()) {
            // Check three things:
            // 1. The ID is within the generated number of slots.
            // 2. The name starts with the user's query.
            // 3. We haven't already found 10 suggestions (for performance).
            if (id <= state.totalSlots && name.startsWith(query)) {
                suggestions.push(name);
            }
            
            if (suggestions.length >= 10) {
                break; // Stop searching once we have enough results
            }
        }

        if (suggestions.length > 0) {
            showAutocomplete(suggestions);
        } else {
            hideAutocomplete();
        }
    }

    function showAutocomplete(suggestions) {
        autocompleteSuggestions.innerHTML = '';
        suggestions.forEach((name, index) => {
            const item = document.createElement('div');
            item.className = 'suggestion-item';
            item.textContent = name;
            item.addEventListener('click', () => {
                searchInput.value = name;
                hideAutocomplete();
                searchForSlot();
            });
            autocompleteSuggestions.appendChild(item);
        });
        autocompleteSuggestions.style.display = 'block';
        activeSuggestionIndex = -1;
    }

    function hideAutocomplete() {
        autocompleteSuggestions.innerHTML = '';
        autocompleteSuggestions.style.display = 'none';
    }

    function handleAutocompleteKeys(e) {
        const items = autocompleteSuggestions.querySelectorAll('.suggestion-item');
        if (items.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeSuggestionIndex = (activeSuggestionIndex + 1) % items.length;
            updateActiveSuggestion(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeSuggestionIndex = (activeSuggestionIndex - 1 + items.length) % items.length;
            updateActiveSuggestion(items);
        } else if (e.key === 'Enter' || e.key === 'Tab') {
            if (activeSuggestionIndex > -1) {
                e.preventDefault();
                items[activeSuggestionIndex].click();
            }
        }
    }

    function updateActiveSuggestion(items) {
        items.forEach(item => item.classList.remove('active'));
        if (activeSuggestionIndex > -1) {
            items[activeSuggestionIndex].classList.add('active');
            items[activeSuggestionIndex].scrollIntoView({ block: 'nearest' });
        }
    }

    // --- Collection Management (URL Sharing) ---
    function generateAndCopyShareLink() {
        const collectionArray = [...state.caughtPokemon];
        const jsonString = JSON.stringify(collectionArray);
        const compressed = LZString.compressToEncodedURIComponent(jsonString);
        
        const shareUrl = `${window.location.origin}${window.location.pathname}#collection=${compressed}`;
        
        collectionLinkInput.value = shareUrl;
        collectionLinkInput.select();

        navigator.clipboard.writeText(shareUrl).then(() => {
            copyLinkBtn.textContent = 'Copied!';
            setTimeout(() => { copyLinkBtn.textContent = 'Copy Link'; }, 2000);
        }).catch(err => {
            console.error('Failed to copy link: ', err);
            copyLinkBtn.textContent = 'Error!';
        });
    }

    function loadCollectionFromUrlHash() {
        if (!window.location.hash.startsWith('#collection=')) {
            return false;
        }
        const compressed = window.location.hash.substring('#collection='.length);
        try {
            const jsonString = LZString.decompressFromEncodedURIComponent(compressed);
            const collectionArray = JSON.parse(jsonString);

            if (Array.isArray(collectionArray) && collectionArray.every(item => typeof item === 'number')) {
                state.caughtPokemon = new Set(collectionArray);
                window.history.replaceState(null, '', window.location.pathname + window.location.search);
                return true;
            }
        } catch (error) {
            console.error('Could not load collection from URL hash:', error);
        }
        return false;
    }

    function toggleCatch(pokemonId) {
        const id = parseInt(pokemonId, 10);
        if (state.caughtPokemon.has(id)) {
            state.caughtPokemon.delete(id);
        } else {
            state.caughtPokemon.add(id);
        }
        saveCollectionToLocalStorage();
        updatePokemonTracker();
    }
    
    function saveCollectionToLocalStorage() {
        localStorage.setItem('caughtPokemon', JSON.stringify([...state.caughtPokemon]));
    }

    function loadCollectionFromLocalStorage() {
        const saved = localStorage.getItem('caughtPokemon');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed)) {
                    state.caughtPokemon = new Set(parsed.map(Number));
                }
            } catch (error) {
                console.error("Failed to load collection from localStorage", error);
                state.caughtPokemon = new Set();
            }
        }
    }

    function refreshAllSlotsUI() {
        for (let i = 1; i <= state.totalSlots; i++) {
            const slot = document.getElementById(`slot-${i}`);
            if (slot) {
                slot.classList.toggle('caught', state.caughtPokemon.has(i));
            }
        }
    }

    // --- Core Functions ---
    async function fetchAllPokemonNames() {
        if (pokemonNameIdMap.size > 0) return;
        try {
            const response = await fetch('https://pokeapi.co/api/v2/pokemon?limit=2000');
            if (!response.ok) throw new Error('Failed to fetch Pokémon list');
            const data = await response.json();
            state.totalAvailablePokemon = data.count;
            for (const entry of data.results) {
                const { name, url } = entry;
                const id = parseInt(url.split('/')[6], 10);
                if (!isNaN(id)) pokemonNameIdMap.set(name, id);
            }
        } catch (error) { console.error("Could not preload Pokémon names:", error); }
    }

    async function generateBinder(numSlots) {
        binder.innerHTML = '';
        pokemonCache.clear(); pokemonDetailCache.clear(); requestQueue.clear(); processing.clear(); preloadedImageUrls.clear();
        searchInput.disabled = true; searchInput.placeholder = 'Loading names...'; searchButton.disabled = true;
        
        state.totalSlots = numSlots > 0 ? numSlots : 0;
        
        const loadedFromUrl = loadCollectionFromUrlHash();
        if (!loadedFromUrl) {
            loadCollectionFromLocalStorage();
        }

        await fetchAllPokemonNames();
        searchInput.placeholder = 'e.g., Pikachu or 25';
        
        state.totalPages = Math.ceil(state.totalSlots / state.slotsPerPage);
        state.totalSlides = Math.ceil(state.totalPages / 2) + 1;
        state.currentSlideIndex = 0;
        for (let i = 0; i < state.totalSlides; i++) {
            const slide = document.createElement('div');
            slide.className = 'slide'; slide.dataset.slideIndex = i;
            if (i === 0) {
                slide.appendChild(createFrontPage());
                slide.appendChild(createPage(1));
            } else {
                slide.appendChild(createPage(i * 2));
                slide.appendChild(createPage(i * 2 + 1));
            }
            binder.appendChild(slide);
        }
        refreshAllSlotsUI();
        updateUI();
        queueDataForPreload();
    }

    function createFrontPage() {
        const page = document.createElement('div');
        page.className = 'page';
        page.id = 'front-page';
        page.innerHTML = `
            <div class="front-page-content">
                <h1>Virtual Binder</h1>
                <p>A tool for visualizing your Pokémon collection.</p>
    
                <div class="tracker">
                    <h3>Collection Progress</h3>
                    <span id="pokemon-tracker">0 / 0 Pokémon</span>
                    <div class="progress-bar-container">
                        <div id="progress-bar-fill" class="progress-bar-fill"></div>
                    </div>
                </div>

                <div class="instructions">
                    <h4>How to Use</h4>
                    <ul>
                        <li><strong>Generate:</strong> Enter how many slots you want and click <em>Generate</em> to build your binder.</li>
                        <li><strong>Catch:</strong> Click on a card to mark it as caught or uncaught.</li>
                        <li><strong>View Details:</strong> Long-press (or long-tap) a card to see detailed information.</li>
                        <li><strong>Save:</strong> Your progress is saved automatically in your browser.</li>
                        <li><strong>Share:</strong> Click <em>Copy Link</em> to generate a shareable URL of your collection.</li>
                    </ul>
                </div>

                <div class="api-credit">
                    <p>This application proudly uses the <a href="https://pokeapi.co/" target="_blank" rel="noopener noreferrer">PokéAPI</a> for all Pokémon data.</p>
                </div>
            </div>`;
        return page;
    }

    function updatePokemonTracker() {
        const trackerSpan = document.getElementById('pokemon-tracker');
        const progressBarFill = document.getElementById('progress-bar-fill');
        if (!trackerSpan || !progressBarFill) return;
    
        trackerSpan.textContent = `${state.caughtPokemon.size} / ${state.totalSlots} Caught`;
    
        const percentage = state.totalSlots > 0 ? (state.caughtPokemon.size / state.totalSlots) * 100 : 0;
        progressBarFill.style.width = `${percentage}%`;
    
        if (percentage > 5) {
            progressBarFill.textContent = `${Math.round(percentage)}%`;
        } else {
            progressBarFill.textContent = '';
        }
    }

    function createPage(pageNum) {
        if (pageNum <= 0 || pageNum > state.totalPages) return createPagePlaceholder();
        const page = document.createElement('div');
        page.className = 'page'; page.dataset.pageNum = pageNum;
        const sheetNum = Math.ceil(pageNum / 2), pageSide = (pageNum % 2 !== 0) ? 'Front' : 'Back';
        page.innerHTML = `<div class="page-header">Sheet ${sheetNum} – Page ${pageNum} (${pageSide})</div><div class="page-grid"></div>`;
        const grid = page.querySelector('.page-grid');
        const startSlot = (pageNum - 1) * state.slotsPerPage + 1;
        for (let i = startSlot; i < startSlot + state.slotsPerPage; i++) {
            if (i > state.totalSlots) break;
            const slot = document.createElement('div');
            slot.className = 'slot'; slot.id = `slot-${i}`;
            slot.innerHTML = `<span class="slot-number">${i}</span><div class="slot-loading">...</div>`;
            grid.appendChild(slot);
        }
        return page;
    }

    function queueDataForPreload() {
        const pagesToLoad = new Set();
        if (state.currentSlideIndex === 0) { if (state.totalPages > 0) pagesToLoad.add(1); }
        else { pagesToLoad.add(state.currentSlideIndex * 2); pagesToLoad.add(state.currentSlideIndex * 2 + 1); }
        const preloadDepthInSlides = 3;
        for (let i = 1; i <= preloadDepthInSlides; i++) {
            const aheadIndex = state.currentSlideIndex + i;
            if (aheadIndex < state.totalSlides) { pagesToLoad.add(aheadIndex * 2); pagesToLoad.add(aheadIndex * 2 + 1); }
            const behindIndex = state.currentSlideIndex - i;
            if (behindIndex > 0) { pagesToLoad.add(behindIndex * 2); pagesToLoad.add(behindIndex * 2 + 1); }
            else if (behindIndex === 0) { pagesToLoad.add(1); }
        }
        requestQueue.clear();
        for (const pageNum of pagesToLoad) {
            if (pageNum > state.totalPages) continue;
            const startSlot = (pageNum - 1) * state.slotsPerPage + 1;
            const endSlot = Math.min(pageNum * state.slotsPerPage, state.totalSlots);
            for (let i = startSlot; i <= endSlot; i++) {
                if (!pokemonCache.has(i) && !processing.has(i)) requestQueue.add(i);
            }
        }
    }

    function preloadImage(url) {
        if (!url || preloadedImageUrls.has(url)) return;
        preloadedImageUrls.add(url);
        const img = new Image(); img.src = url;
    }

    async function queueWorker() {
        if (requestQueue.size === 0) return;
        const pokemonId = requestQueue.values().next().value;
        requestQueue.delete(pokemonId); processing.add(pokemonId);
        try {
            const data = await loadPokemonData(pokemonId);
            if (data.imageUrl) preloadImage(data.imageUrl);
            if (!data.error) loadPokemonDetails(pokemonId);
            const slotElement = document.getElementById(`slot-${pokemonId}`);
            if (slotElement) populateSlot(slotElement, data);
        } catch (error) { console.error(`Failed to load Pokémon ${pokemonId}:`, error);
        } finally { processing.delete(pokemonId); }
    }

    function startQueueManager() { setInterval(() => { while (requestQueue.size > 0 && processing.size < MAX_CONCURRENT) queueWorker(); }, 50); }

    async function loadPokemonData(pokemonId) {
        if (pokemonCache.has(pokemonId)) return pokemonCache.get(pokemonId);
        try {
            const response = await fetch(`${POKE_API_BASE_URL}${pokemonId}`);
            if (!response.ok) throw new Error('Not found');
            const data = await response.json();
            const pokemon = { id: data.id, name: data.name, types: data.types.map(t => t.type.name), imageUrl: data.sprites.other['official-artwork']?.front_default || data.sprites.front_default };
            pokemonCache.set(pokemonId, pokemon);
            return pokemon;
        } catch (error) { return { id: pokemonId, name: 'N/A', imageUrl: null, error: true }; }
    }

    function populateSlot(slotElement, pokemonData) {
        if (pokemonData.error || !pokemonData.imageUrl) {
            slotElement.innerHTML = `<span class="slot-number">${pokemonData.id}</span><div class="slot-error">N/A</div>`;
            return;
        }
        const typeIconsHTML = pokemonData.types.map(type => `<img src="https://raw.githubusercontent.com/msikma/pokesprite/master/misc/types/gen8/${type}.png" class="type-icon-small" alt="${type}" title="${type}">`).join('');
        slotElement.innerHTML = `<div class="slot-type-icons">${typeIconsHTML}</div><span class="slot-number">${pokemonData.id}</span><img src="${pokemonData.imageUrl}" alt="${pokemonData.name}" class="slot-img" loading="lazy"><span class="slot-name">${pokemonData.name}</span>`;
        const startColor = TYPE_COLORS[pokemonData.types[0]] || '#ccc';
        const endColor = pokemonData.types.length > 1 ? TYPE_COLORS[pokemonData.types[1]] : lightenColor(startColor, 40);
        slotElement.style.setProperty('--gradient-start', startColor);
        slotElement.style.setProperty('--gradient-end', endColor);
        if (state.caughtPokemon.has(parseInt(pokemonData.id))) slotElement.classList.add('caught');
        slotElement.classList.add('is-loaded');
    }

    async function showInfoCard(pokemonId) {
        const details = await loadPokemonDetails(pokemonId);
        if (!details) return;
        document.body.classList.add('modal-open');
        infoModal.classList.add('is-visible');
        const startColor = TYPE_COLORS[details.types[0]] || '#ccc';
        const endColor = details.types.length > 1 ? TYPE_COLORS[details.types[1]] : lightenColor(startColor, 40);
        infoCard.style.setProperty('--gradient-start', startColor);
        infoCard.style.setProperty('--gradient-end', endColor);
        const toRoman = num => 'I'.repeat(num).replace(/IIII/g, 'IV').replace(/VIV/g, 'IX').replace(/IIIII/g, 'V').replace(/VV/g, 'X');
        const generationName = GENERATION_NAMES[details.generation.name] || details.generation.name.replace('generation-', '').toUpperCase();
        const generationRoman = toRoman(details.generation.url.split('/')[6]);
        const catchButtonImgSrc = state.caughtPokemon.has(details.id) ? 'images/pokeball-caught.png' : 'images/pokeball-empty.png';
        infoCard.innerHTML = `
            <div class="shimmer-overlay"></div>
            <div class="info-card-image-container"><img src="${details.imageUrl}" alt="${details.name}" class="info-card-image"></div>
            <div class="info-card-details">
                <h2 class="info-card-name">${details.name}</h2>
                <button class="catch-toggle-btn" data-id="${details.id}"><img src="${catchButtonImgSrc}" alt="Catch status"></button>
                <div class="info-card-types">${details.types.map(type => `<span class="type-badge type-${type}">${type}</span>`).join('')}</div>
                <div class="info-card-stats">${details.stats.map(stat => `<div class="stat-item"><span class="stat-name">${stat.name.replace('special-', 'sp. ')}</span><div class="stat-bar"><div class="stat-bar-fill" style="width: ${Math.min(100, (stat.base_stat / 160) * 100)}%;"></div></div><span class="stat-value">${stat.base_stat}</span></div>`).join('')}</div>
                <div class="info-card-footer">Generation ${generationRoman} (${generationName})</div>
            </div>`;
        
        const catchBtn = infoCard.querySelector('.catch-toggle-btn');
        catchBtn.addEventListener('click', (e) => {
            const btn = e.currentTarget;
            const img = btn.querySelector('img');
            const id = parseInt(btn.dataset.id, 10);
            
            if (!state.caughtPokemon.has(id)) {
                btn.classList.add('catch-animation');
                btn.addEventListener('animationend', () => btn.classList.remove('catch-animation'), { once: true });
            }

            toggleCatch(id);
            const isNowCaught = state.caughtPokemon.has(id);
            
            img.src = isNowCaught ? 'images/pokeball-caught.png' : 'images/pokeball-empty.png';
            const binderSlot = document.getElementById(`slot-${id}`);
            if (binderSlot) binderSlot.classList.toggle('caught', isNowCaught);
        });

        const shimmer = infoCard.querySelector('.shimmer-overlay');
        infoCard.addEventListener('mousemove', (e) => {
            const { clientX, clientY } = e;
            const { top, left, width, height } = infoCard.getBoundingClientRect();
            const x = clientX - left;
            const y = clientY - top;
            const centerX = width / 2;
            const centerY = height / 2;
            const deltaX = x - centerX;
            const deltaY = y - centerY;
            const maxRotate = 8;
            const rotateX = (deltaY / centerY) * -maxRotate;
            const rotateY = (deltaX / centerX) * maxRotate;
            infoCard.style.transition = 'transform 0.1s ease-out';
            infoCard.style.transform = `perspective(1500px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
            
            shimmer.style.background = `radial-gradient(circle at ${x}px ${y}px, rgba(255, 255, 255, 0.4), rgba(255, 255, 255, 0))`;
            shimmer.style.opacity = 1;
        });

        infoCard.addEventListener('mouseleave', () => {
            infoCard.style.transition = 'transform 0.5s ease-out';
            infoCard.style.transform = 'perspective(1500px) rotateX(0) rotateY(0)';
            shimmer.style.opacity = 0;
        });
    }

    function hideInfoCard() {
        document.body.classList.remove('modal-open');
        infoModal.classList.remove('is-visible');
    }

    async function loadPokemonDetails(pokemonId) {
        pokemonId = parseInt(pokemonId, 10);
        if (pokemonDetailCache.has(pokemonId)) return pokemonDetailCache.get(pokemonId);
        try {
            const p_res = await fetch(`${POKE_API_BASE_URL}${pokemonId}`);
            if (!p_res.ok) throw new Error('Pokemon not found');
            const p_data = await p_res.json();
            const s_res = await fetch(p_data.species.url);
            if (!s_res.ok) throw new Error('Species not found');
            const s_data = await s_res.json();
            const details = {
                id: p_data.id, name: p_data.name, imageUrl: p_data.sprites.other['official-artwork']?.front_default || p_data.sprites.front_default,
                types: p_data.types.map(t => t.type.name),
                stats: p_data.stats.map(s => ({ name: s.stat.name, base_stat: s.base_stat })),
                generation: s_data.generation,
            };
            pokemonDetailCache.set(pokemonId, details);
            return details;
        } catch (error) {
            console.error(`Failed to load details for ${pokemonId}:`, error);
            return null;
        }
    }

    function navigate(direction) {
        const newIndex = state.currentSlideIndex + direction;
        if (newIndex >= 0 && newIndex < state.totalSlides) {
            state.currentSlideIndex = newIndex;
            updateUI();
            queueDataForPreload();
        }
    }

    function navigateToHome() {
        if (state.currentSlideIndex !== 0) {
            state.currentSlideIndex = 0;
            updateUI();
            queueDataForPreload();
        }
    }
    
    function handleKeyPress(e) {
    // First, check if the user is currently focused on an input field.
    // If they are, we don't want to change pages.
    if (e.target.tagName === 'INPUT') {
        return;
    }

    // Now, check which key was pressed.
    if (e.key === 'ArrowLeft') {
        // Prevent default browser action for arrow keys, like scrolling.
        e.preventDefault();
        // Trigger the 'Previous' button's action.
        navigate(-1);
    } else if (e.key === 'ArrowRight') {
        // Prevent default browser action.
        e.preventDefault();
        // Trigger the 'Next' button's action.
        navigate(1);
    }
}

    function searchForSlot() {
        hideAutocomplete(); // --- NEW ---
        const query = searchInput.value.trim(); if (!query) return;
        let slotNumber = -1;
        const numId = parseInt(query, 10);
        if (!isNaN(numId) && numId > 0) slotNumber = numId;
        else { const nameId = pokemonNameIdMap.get(query.toLowerCase()); if (nameId) slotNumber = nameId; }
        if (slotNumber > 0 && slotNumber <= state.totalSlots) {
            navigateToSlot(slotNumber);
            errorMessage.style.display = 'none'; // --- MODIFIED ---
        }
        else {
            errorMessage.style.display = 'inline';
        }
    }

    function navigateToSlot(slotNumber) {
        const pageNum = Math.ceil(slotNumber / state.slotsPerPage);
        state.currentSlideIndex = (pageNum <= 1) ? 0 : Math.ceil((pageNum - 1) / 2);
        updateUI();
        queueDataForPreload();
        const targetSlot = document.getElementById(`slot-${slotNumber}`);
        if (targetSlot) {
            const observer = new MutationObserver(() => {
                if (targetSlot.classList.contains('is-loaded')) {
                    targetSlot.classList.add('highlight');
                    targetSlot.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    observer.disconnect();
                }
            });
            observer.observe(targetSlot, { childList: true, attributes: true });
            if (targetSlot.classList.contains('is-loaded')) {
                targetSlot.classList.add('highlight');
                targetSlot.scrollIntoView({ behavior: 'smooth', block: 'center' });
                observer.disconnect();
            }
        }
    }

    function updateUI() {
        const existingHighlight = binder.querySelector('.slot.highlight');
        if (existingHighlight) existingHighlight.classList.remove('highlight');
        errorMessage.style.display = 'none';
        binder.querySelectorAll('.slide').forEach((slide, index) => slide.classList.toggle('active', index === state.currentSlideIndex));
        prevButton.disabled = state.currentSlideIndex === 0;
        homeButton.disabled = state.currentSlideIndex === 0;
        nextButton.disabled = state.currentSlideIndex >= state.totalSlides - 1;
        const hasContent = state.totalSlots > 0;
        searchInput.disabled = !hasContent;
        searchButton.disabled = !hasContent;
        if (!hasContent) searchInput.value = '';
        slideCounter.textContent = hasContent ? `View ${state.currentSlideIndex + 1} / ${state.totalSlides}` : '';
        updatePokemonTracker();
    }

    function createPagePlaceholder() {
        const placeholder = document.createElement('div');
        placeholder.className = 'page-placeholder';
        return placeholder;
    }

    initTheme();
    generateBinder(parseInt(totalSlotsInput.value, 10));
    startQueueManager();
});

