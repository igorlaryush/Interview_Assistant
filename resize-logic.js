// --- Resize Logic ---
const resizeHandles = document.querySelectorAll('.resize-handle');
let isResizing = false;
let currentHandle = null;
let startX, startY, startBounds;
const MIN_WIDTH = 300;
const MIN_HEIGHT = 200;

resizeHandles.forEach(handle => {
    handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation(); // Prevent drag-region from catching it
        
        isResizing = true;
        currentHandle = handle;
        startX = e.screenX;
        startY = e.screenY;
        startBounds = {
            x: window.screenX,
            y: window.screenY,
            width: window.outerWidth,
            height: window.outerHeight
        };
        
        // Add listeners to document to track mouse outside window
        document.addEventListener('mousemove', handleResize);
        document.addEventListener('mouseup', stopResize);
    });
});

function handleResize(e) {
    if (!isResizing) return;

    const dx = e.screenX - startX;
    const dy = e.screenY - startY;
    
    let newBounds = { ...startBounds };
    
    // Horizontal Resizing
    if (currentHandle.classList.contains('right') || currentHandle.classList.contains('bottom-right') || currentHandle.classList.contains('top-right')) {
        newBounds.width = Math.max(MIN_WIDTH, startBounds.width + dx);
    } else if (currentHandle.classList.contains('left') || currentHandle.classList.contains('bottom-left') || currentHandle.classList.contains('top-left')) {
        // Calculate width first
        const proposedWidth = startBounds.width - dx;
        newBounds.width = Math.max(MIN_WIDTH, proposedWidth);
        // Adjust x so right edge stays stationary: x = old_right - new_width
        // old_right = startBounds.x + startBounds.width
        // newBounds.x = (startBounds.x + startBounds.width) - newBounds.width
        newBounds.x = startBounds.x + startBounds.width - newBounds.width;
    }
    
    // Vertical Resizing
    if (currentHandle.classList.contains('bottom') || currentHandle.classList.contains('bottom-right') || currentHandle.classList.contains('bottom-left')) {
        newBounds.height = Math.max(MIN_HEIGHT, startBounds.height + dy);
    } else if (currentHandle.classList.contains('top') || currentHandle.classList.contains('top-left') || currentHandle.classList.contains('top-right')) {
        // Calculate height first
        const proposedHeight = startBounds.height - dy;
        newBounds.height = Math.max(MIN_HEIGHT, proposedHeight);
        // Adjust y so bottom edge stays stationary: y = old_bottom - new_height
        // old_bottom = startBounds.y + startBounds.height
        newBounds.y = startBounds.y + startBounds.height - newBounds.height;
    }

    window.api.resizeWindow(newBounds);
}

function stopResize() {
    isResizing = false;
    currentHandle = null;
    document.removeEventListener('mousemove', handleResize);
    document.removeEventListener('mouseup', stopResize);
}

// --- Column Resize Logic ---
function initColumnResizers() {
    const resizer1 = document.getElementById('resizer1');
    const resizer2 = document.getElementById('resizer2');
    const sidebar = document.getElementById('sidebarColumn');
    const dialogue = document.getElementById('dialogueColumn');
    const screenshot = document.getElementById('screenshotColumn');
    
    // Convert flex to explicit percentages/pixels on first interaction
    function lockWidths() {
        const totalWidth = sidebar.parentElement.getBoundingClientRect().width;
        
        // Remove flex: 1 and set explicit flex-basis/width
        if (!sidebar.style.flexBasis) {
            sidebar.style.flex = `0 0 ${sidebar.getBoundingClientRect().width}px`;
            dialogue.style.flex = `0 0 ${dialogue.getBoundingClientRect().width}px`;
            screenshot.style.flex = `1 1 0`; // Last one takes remaining space
        }
    }

    if (resizer1) {
        let startX, startSidebarWidth, startDialogueWidth;

        resizer1.addEventListener('mousedown', function(e) {
            e.preventDefault();
            lockWidths();
            startX = e.clientX;
            startSidebarWidth = sidebar.getBoundingClientRect().width;
            startDialogueWidth = dialogue.getBoundingClientRect().width;

            resizer1.classList.add('resizing');
            document.body.style.cursor = 'col-resize';

            const mouseMoveHandler = function(e) {
                let dx = e.clientX - startX;
                
                // Constraints
                const maxSidebarWidth = startSidebarWidth + startDialogueWidth - 150;
                const newSidebarWidth = Math.min(Math.max(100, startSidebarWidth + dx), maxSidebarWidth);
                
                const newDialogueWidth = startDialogueWidth - (newSidebarWidth - startSidebarWidth);
                
                sidebar.style.flex = `0 0 ${newSidebarWidth}px`;
                dialogue.style.flex = `0 0 ${newDialogueWidth}px`;
            };

            const mouseUpHandler = function() {
                resizer1.classList.remove('resizing');
                document.body.style.cursor = '';
                document.removeEventListener('mousemove', mouseMoveHandler);
                document.removeEventListener('mouseup', mouseUpHandler);
            };

            document.addEventListener('mousemove', mouseMoveHandler);
            document.addEventListener('mouseup', mouseUpHandler);
        });
    }

    if (resizer2) {
        let startX, startDialogueWidth;

        resizer2.addEventListener('mousedown', function(e) {
            e.preventDefault();
            lockWidths();
            startX = e.clientX;
            startDialogueWidth = dialogue.getBoundingClientRect().width;

            resizer2.classList.add('resizing');
            document.body.style.cursor = 'col-resize';

            const mouseMoveHandler = function(e) {
                const dx = e.clientX - startX;
                // Don't let screenshot column get smaller than 150px
                const maxDialogueWidth = startDialogueWidth + screenshot.getBoundingClientRect().width - 150;
                let newDialogueWidth = startDialogueWidth + dx;
                newDialogueWidth = Math.max(150, Math.min(newDialogueWidth, maxDialogueWidth));
                
                dialogue.style.flex = `0 0 ${newDialogueWidth}px`;
                // screenshot column handles the rest automatically since it's flex 1
            };

            const mouseUpHandler = function() {
                resizer2.classList.remove('resizing');
                document.body.style.cursor = '';
                document.removeEventListener('mousemove', mouseMoveHandler);
                document.removeEventListener('mouseup', mouseUpHandler);
            };

            document.addEventListener('mousemove', mouseMoveHandler);
            document.addEventListener('mouseup', mouseUpHandler);
        });
    }
}

// Initialize when DOM is ready or immediately if already loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initColumnResizers);
} else {
    initColumnResizers();
}
