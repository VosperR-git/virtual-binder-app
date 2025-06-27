document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const generatorForm = document.getElementById('generator-form');
    const totalSlotsInput = document.getElementById('total-slots-input');
    const searchForm = document.getElementById('search-form');
    const searchInput = document.getElementById('search-input');
    const searchButton = document.getElementById('search-button');
    const binder = document.getElementById('binder');
    const prevButton = document.getElementById('prev-button');
    const nextButton = document.getElementById('next-button');
    const slideCounter = document.getElementById('slide-counter');
    const errorMessage = document.getElementById('error-message');

    // --- App State ---
    let state = {
        totalSlots: 0,
        totalPages: 0,
        totalSlides: 0,
        currentSlideIndex: 0,
        slotsPerSheet: 32,
        slotsPerPage: 16,
    };

    // --- Event Listeners ---
    generatorForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const numSlots = parseInt(totalSlotsInput.value, 10);
        if (numSlots > 0) {
            generateBinder(numSlots);
        }
    });

    searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        searchForSlot();
    });
    
    searchInput.addEventListener('input', () => {
        errorMessage.style.display = 'none'; // Hide error on new input
    });

    prevButton.addEventListener('click', () => navigate(-1));
    nextButton.addEventListener('click', () => navigate(1));
    
    // --- Initial Generation ---
    generateBinder(parseInt(totalSlotsInput.value, 10));

    // --- Core Functions ---

    /**
     * Generates the entire binder structure based on the total number of slots.
     * @param {number} numSlots - The total number of slots to create.
     */
    function generateBinder(numSlots) {
        // 1. Reset and calculate new state
        binder.innerHTML = '';
        state.totalSlots = numSlots;
        state.totalPages = Math.ceil(numSlots / state.slotsPerPage);
        state.totalSlides = Math.ceil(state.totalPages / 2) + 1; // +1 for the cover/intro slide logic
        state.currentSlideIndex = 0;

        // 2. Generate each slide
        for (let i = 0; i < state.totalSlides; i++) {
            const slide = document.createElement('div');
            slide.className = 'slide';
            slide.dataset.slideIndex = i;

            if (i === 0) {
                // Slide 0: The very first view, only showing Page 1 on the right
                slide.appendChild(createPagePlaceholder());
                slide.appendChild(createPage(1));
            } else {
                // Subsequent slides: Back of previous sheet (left), Front of current sheet (right)
                const leftPageNum = i * 2;
                const rightPageNum = i * 2 + 1;

                slide.appendChild(createPage(leftPageNum));
                slide.appendChild(createPage(rightPageNum));
            }
            binder.appendChild(slide);
        }
        
        // 3. Enable controls and update view
        updateUI();
    }

    /**
     * Creates a single page element with its grid of slots.
     * @param {number} pageNum - The 1-based page number to create.
     * @returns {HTMLElement} The generated page element or a placeholder.
     */
    function createPage(pageNum) {
        if (pageNum <= 0 || pageNum > state.totalPages) {
            return createPagePlaceholder();
        }

        const page = document.createElement('div');
        page.className = 'page';

        // Create Header
        const sheetNum = Math.ceil(pageNum / 2);
        const pageSide = (pageNum % 2 !== 0) ? 'Front' : 'Back';
        const header = document.createElement('div');
        header.className = 'page-header';
        header.textContent = `Sheet ${sheetNum} – Page ${pageNum} (${pageSide})`;
        page.appendChild(header);

        // Create Grid & Slots
        const grid = document.createElement('div');
        grid.className = 'page-grid';

        const startSlot = (pageNum - 1) * state.slotsPerPage + 1;
        const endSlot = pageNum * state.slotsPerPage;

        for (let i = startSlot; i <= endSlot; i++) {
            if (i > state.totalSlots) break; // Don't create slots beyond the total
            
            const slot = document.createElement('div');
            slot.className = 'slot';
            slot.textContent = i;
            slot.id = `slot-${i}`; // Crucial for searching
            grid.appendChild(slot);
        }
        page.appendChild(grid);
        return page;
    }

    /**
     * Creates an invisible placeholder div to maintain layout.
     * @returns {HTMLElement} The placeholder element.
     */
    function createPagePlaceholder() {
        const placeholder = document.createElement('div');
        placeholder.className = 'page-placeholder';
        return placeholder;
    }

    /**
     * Handles navigation between slides.
     * @param {number} direction - -1 for previous, 1 for next.
     */
    function navigate(direction) {
        const newIndex = state.currentSlideIndex + direction;
        if (newIndex >= 0 && newIndex < state.totalSlides) {
            state.currentSlideIndex = newIndex;
            updateUI();
        }
    }
    
    /**
     * Finds a slot, navigates to its slide, and highlights it.
     */
    function searchForSlot() {
        const slotNumber = parseInt(searchInput.value, 10);
        
        // Validate input
        if (isNaN(slotNumber) || slotNumber < 1 || slotNumber > state.totalSlots) {
            errorMessage.style.display = 'inline';
            return;
        }
        
        // 1. Determine which page the number is on
        const pageNum = Math.ceil(slotNumber / state.slotsPerPage);
        
        // 2. Navigate to the correct slide
        // Slide 0: Page 1. Slide 1: Pages 2 & 3. Slide 2: Pages 4 & 5...
        // Slide Index = floor(PageNum / 2)
        const targetSlideIndex = Math.floor(pageNum / 2); 
        if (pageNum % 2 === 1 && pageNum > 1) {
           // If it's an odd page (and not page 1), it's on the slide with its preceding even page
           state.currentSlideIndex = Math.ceil((pageNum-1) / 2)
        } else if(pageNum > 1) {
            // if it is an even page it shares a slide with the next odd page
            state.currentSlideIndex = pageNum / 2
        } else {
            // Page 1 is on slide 0
            state.currentSlideIndex = 0;
        }

        updateUI();
        
        // 3. Highlight the slot box
        // First, remove any existing highlight
        const existingHighlight = binder.querySelector('.slot.highlight');
        if (existingHighlight) {
            existingHighlight.classList.remove('highlight');
        }
        
        // Then, add highlight to the new slot
        const targetSlot = document.getElementById(`slot-${slotNumber}`);
        if (targetSlot) {
            targetSlot.classList.add('highlight');
            // Scroll to the element if it's off-screen on mobile
            targetSlot.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    /**
     * Updates the entire UI based on the current state.
     */
    function updateUI() {
        // Update active slide
        const slides = binder.querySelectorAll('.slide');
        slides.forEach((slide, index) => {
            slide.classList.toggle('active', index === state.currentSlideIndex);
        });

        // Update navigation buttons
        prevButton.disabled = state.currentSlideIndex === 0;
        nextButton.disabled = state.currentSlideIndex === state.totalSlides - 1;
        
        // Enable/disable search
        const hasContent = state.totalSlots > 0;
        searchInput.disabled = !hasContent;
        searchButton.disabled = !hasContent;
        if (!hasContent) searchInput.value = '';

        // Update slide counter text
        if (hasContent) {
            // Display is 1-based for user-friendliness
            slideCounter.textContent = `View ${state.currentSlideIndex + 1} / ${state.totalSlides}`;
        } else {
            slideCounter.textContent = '';
        }
        
        // Clear any highlights when navigating away manually
        const existingHighlight = binder.querySelector('.slot.highlight');
        if (existingHighlight) {
            existingHighlight.classList.remove('highlight');
        }
        errorMessage.style.display = 'none';
    }
});