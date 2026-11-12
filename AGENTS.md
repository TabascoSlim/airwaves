# Airwaves - Agent Development Guidelines

This file contains build commands, code style guidelines, and development practices for agentic coding agents working on the Airwaves web radio discovery application.

## Project Overview

**Airwaves** is a modern web radio discovery app built with vanilla HTML, CSS, and JavaScript. The application allows users to discover and listen to radio stations from around the world through a beautiful interface with 3D globe visualization.

**Tech Stack:**
- Frontend: Vanilla HTML5, CSS3, JavaScript (ES6+)
- API: Radio Browser API (https://de1.api.radio-browser.info)
- Audio: HTML5 Audio API
- Styling: CSS Grid, Flexbox, CSS Custom Properties
- Future: 3D globe visualization (placeholder)

## Build & Development Commands

### Local Development
```bash
# Start local development server
python3 -m http.server 8000
# or
npx serve .
# or
php -S localhost:8000
```

### Testing
```bash
# No automated tests currently - manual testing required
# Test in multiple browsers:
# - Chrome/Chromium (primary)
# - Firefox
# - Safari
# - Edge
```

### Linting & Validation
```bash
# HTML validation
npx html-validate index.html

# CSS linting
npx stylelint styles.css

# JavaScript linting
npx eslint app.js

# Full validation
npx html-validate index.html && npx stylelint styles.css && npx eslint app.js
```

### Build for Production
```bash
# Minify CSS
npx clean-css-cli -o dist/styles.min.css styles.css

# Minify JavaScript
npx terser app.js -o dist/app.min.js

# Copy HTML to dist
cp index.html dist/

# Update HTML references to minified files
# (Manual step or use build script)
```

## Code Style Guidelines

### HTML Structure
- Use semantic HTML5 elements (`<header>`, `<main>`, `<section>`, `<footer>`)
- Follow proper document hierarchy (h1 → h2 → h3)
- Include accessibility attributes (`alt`, `aria-label`, `role`)
- Use BEM-like naming for CSS classes (`component__element--modifier`)
- Validate HTML before committing

### CSS Architecture
- **CSS Custom Properties**: Use CSS variables for theming and consistency
- **Mobile-First**: Design for mobile, then enhance for desktop
- **Component-Based**: Organize styles by UI components
- **Responsive Design**: Use CSS Grid and Flexbox for layouts
- **Dark Theme**: Primary theme with light theme support for future

```css
/* Example CSS structure */
:root {
    --primary-color: #6366f1;
    --background-dark: #0f172a;
    /* ... */
}

.component {
    /* Base styles */
}

.component__element {
    /* Element styles */
}

.component__element--modifier {
    /* Modifier styles */
}

@media (max-width: 768px) {
    /* Mobile adjustments */
}
```

### JavaScript Standards
- **ES6+ Features**: Use modern JavaScript (arrow functions, async/await, classes)
- **Error Handling**: Implement comprehensive try-catch blocks
- **API Integration**: Use fetch API with proper error handling
- **Event Delegation**: Use event listeners efficiently
- **Code Organization**: Use ES6 classes for application structure

```javascript
// Example JavaScript pattern
class ComponentClass {
    constructor() {
        this.init();
    }
    
    init() {
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        // Event listener setup
    }
    
    async apiCall() {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error('API error');
            return await response.json();
        } catch (error) {
            console.error('API call failed:', error);
            this.showError('Failed to load data');
        }
    }
}
```

## Naming Conventions

### Files & Directories
- **HTML**: `kebab-case.html` (e.g., `index.html`, `station-details.html`)
- **CSS**: `kebab-case.css` (e.g., `styles.css`, `globe-visualization.css`)
- **JavaScript**: `kebab-case.js` (e.g., `app.js`, `audio-controls.js`)
- **Images**: `kebab-case` with appropriate extension (e.g., `globe-icon.svg`)

### CSS Classes
- Use BEM methodology: `block__element--modifier`
- Examples: `.audio-controls`, `.audio-controls__button`, `.audio-controls__button--playing`

### JavaScript
- **Classes**: `PascalCase` (e.g., `AirwavesApp`, `AudioController`)
- **Functions/Methods**: `camelCase` (e.g., `fetchRandomStation`, `updateVolume`)
- **Variables**: `camelCase` (e.g., `currentStation`, `isPlaying`)
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `API_BASE_URL`, `DEFAULT_VOLUME`)

## Error Handling Guidelines

### API Errors
- Always wrap API calls in try-catch blocks
- Provide user-friendly error messages
- Log technical errors to console
- Implement retry logic for network failures

### Audio Errors
- Handle audio loading failures gracefully
- Provide fallback options for unsupported formats
- Display clear error messages for stream issues

### User Input Validation
- Validate all user inputs before processing
- Provide immediate feedback for invalid inputs
- Use HTML5 validation attributes where appropriate

## Performance Guidelines

### Asset Optimization
- Optimize images and icons (use SVG where possible)
- Minify CSS and JavaScript for production
- Implement lazy loading for heavy components
- Use efficient CSS selectors

### API Usage
- Implement caching for API responses
- Use appropriate timeout values for API calls
- Limit concurrent API requests
- Handle rate limiting gracefully

### Audio Streaming
- Preload audio metadata but not full streams
- Implement adaptive bitrate if possible
- Use efficient audio formats (MP3, AAC)
- Handle network interruptions smoothly

## Accessibility Requirements

### Semantic HTML
- Use proper heading hierarchy
- Include alt text for images
- Use ARIA labels for interactive elements
- Ensure keyboard navigation support

### Visual Accessibility
- Maintain sufficient color contrast ratios (4.5:1 minimum)
- Support high contrast mode
- Use readable font sizes (16px minimum)
- Provide focus indicators

### Audio Accessibility
- Include visual indicators for audio state
- Provide captions/transcripts where possible
- Implement volume controls with fine granularity
- Support screen reader announcements

## Browser Compatibility

### Target Browsers
- **Primary**: Chrome/Chromium (latest)
- **Secondary**: Firefox (latest), Safari (latest)
- **Tertiary**: Edge (latest)

### Feature Support
- Use feature detection for new APIs
- Provide polyfills for essential features
- Implement graceful degradation for older browsers
- Test thoroughly across target browsers

## Security Considerations

### API Security
- Use HTTPS for all API calls
- Validate API responses before processing
- Implement CORS handling appropriately
- Sanitize user inputs before API calls

### Content Security
- Validate audio stream URLs
- Implement Content Security Policy headers
- Prevent XSS attacks through input sanitization
- Use secure audio streaming protocols

## Development Workflow

### Code Review Checklist
- [ ] HTML validates without errors
- [ ] CSS follows naming conventions
- [ ] JavaScript handles errors properly
- [ ] Responsive design works on mobile
- [ ] Accessibility features implemented
- [ ] Cross-browser compatibility verified
- [ ] Performance optimizations applied

### Testing Requirements
- Manual testing in all target browsers
- Mobile device testing (iOS/Android)
- Audio playback testing across formats
- API error scenario testing
- Accessibility testing with screen readers

## Future Development Guidelines

### 3D Globe Integration
- Use Three.js or similar for 3D visualization
- Implement smooth animations and transitions
- Optimize for performance on mobile devices
- Provide fallback for non-WebGL browsers

### Additional Features
- Station search and filtering
- Favorites/bookmarks system
- User preferences and settings
- Social sharing capabilities
- Offline mode support

### Code Organization
- Consider modular JavaScript architecture for larger features
- Implement component-based CSS organization
- Use build tools for optimization
- Add automated testing when appropriate

## Tools & Resources

### Recommended VS Code Extensions
- HTML CSS Support
- ESLint
- Prettier
- Live Server
- Browser Preview

### Online Tools
- HTML Validator: https://validator.w3.org/
- CSS Lint: https://stylelint.io/
- JavaScript Lint: https://eslint.org/
- Browser Testing: https://browserstack.com/

### Documentation
- MDN Web Docs: https://developer.mozilla.org/
- Radio Browser API: https://api.radio-browser.info/
- Web Audio API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API

---

**Note**: This is a vanilla JavaScript project. Avoid introducing frameworks unless absolutely necessary. Prioritize performance, accessibility, and cross-browser compatibility in all development decisions.