# eBay Price Reducer - UI Features & Requirements Document

**Version:** 1.0
**Last Updated:** 2025-10-03
**Purpose:** Complete inventory of existing UI features and functionality

---

## Table of Contents

1. [Application Overview](#application-overview)
2. [Route Structure](#route-structure)
3. [Page-by-Page Features](#page-by-page-features)
4. [Global Features](#global-features)
5. [Technical Architecture](#technical-architecture)
6. [User Actions Summary](#user-actions-summary)

---

## Application Overview

**Type:** Serverless full-stack application
**Frontend:** React + Vite
**Backend:** Netlify Serverless Functions
**Database:** Supabase (PostgreSQL)
**Primary Purpose:** Automated eBay price reduction and listing management

---

## Route Structure

### Main Application Routes

| Route | Component | Access Level | Description |
|-------|-----------|--------------|-------------|
| `/` | Dashboard | Protected | Main dashboard with statistics and quick actions |
| `/listings` | Listings | Protected | eBay listing management with advanced filtering |
| `/auto-list` | Auto-List | Protected | Automated listing creation from multiple sources |
| `/strategies` | Strategies | Protected | Price reduction strategy configuration |
| `/analytics` | Analytics | Protected | Market analytics and pricing recommendations |
| `/account` | Account | Protected | User settings and integrations management |
| `/admin-settings` | Admin Settings | Protected | eBay developer credentials configuration |
| `/login` | Login | Public | Authentication and user registration |

### Authentication & Protection

- **Protected Routes:** All routes except `/login` require authentication
- **Auth Method:** Client-side localStorage check with Supabase
- **Redirect Logic:** Unauthenticated users automatically redirected to `/login`
- **Auth State:** Persisted in `localStorage.getItem('isAuthenticated')`

---

## Page-by-Page Features

### 1. Login Page (`/login`)

**File:** `frontend/src/pages/Login.jsx`

#### Authentication Features
- **Login Form:**
  - Username/email input
  - Password input (minimum 6 characters)
  - "Remember me" checkbox
  - Form validation
  - Demo login button (quick access with demo credentials)

#### Registration Features
- **Sign Up Form:**
  - Full name input
  - Username input
  - Email input with validation
  - Password input with confirmation
  - Password matching validation
  - Email verification requirement

#### Password Recovery
- **Forgot Password Flow:**
  - Email or username entry
  - Password reset link delivery
  - Reset code entry
  - New password creation
  - Password confirmation

#### User Experience
- Success/error notification banner
- Auto-dismiss notifications (5 seconds)
- Demo credentials display (username: demo, password: password)
- Feature list display

---

### 2. Dashboard Page (`/`)

**Files:** `frontend/src/App.jsx` (inline) & `frontend/src/pages/Dashboard.jsx`

#### Version A (Simple Dashboard - App.jsx)

**Statistics Cards:**
- Active Listings count (static: 24)
- Price Reductions Today count (static: 7)
- Active Strategies count (static: 3)
- Total Savings amount (static: $1,247)

**Quick Actions Panel:**
- View All Listings → `/listings`
- Manage Strategies → `/strategies`
- Market Analytics → `/analytics`
- Account Settings → `/account`

#### Version B (Advanced Dashboard - Dashboard.jsx)

**Real-time Statistics:**
- Total Listings (from Supabase)
- Active Monitoring count
- Total Value calculation
- Potential Savings calculation

**Listings Management:**
- View all listings with images
- Configure price drop rules per listing
- Edit price reduction settings:
  - Strategy selection (fixed_percentage, market_based, time_based)
  - Drop percentage (1-50%)
  - Minimum price setting
  - Check interval (1-30 days)
- Toggle price reduction on/off per listing
- View listing details

**Quick Actions:**
- View All Listings
- Manage Strategies
- Import from eBay
- Run Price Check

---

### 3. Listings Page (`/listings`)

**File:** `frontend/src/pages/Listings.jsx`

#### eBay Integration
- Connect eBay account banner (if not connected)
- Import from eBay button
- Manual sync trigger
- OAuth connection status display
- Auto-sync every 6 hours
- Smart caching (6-hour freshness, 12-hour cache)

#### Search & Filter System
- **Full-text Search:**
  - Search across: title, SKU, price, quantity, strategy, ID
  - Real-time search with result count
  - Search result highlighting

- **Advanced Filtering:**
  - Filter by strategy
  - Filter by price ranges (>, <, >=, <=, =)
  - Filter by quantity
  - Filter by listing age
  - Filter by SKU
  - Filter by monitoring status (Active/Paused)
  - Multiple simultaneous filters
  - Clear all filters button

#### Table Customization (Desktop)
- Column visibility toggle
- Drag-and-drop column reordering
- Persistent column settings (localStorage)
- Sortable columns (title, quantity, price, view count, watch count, listing age)

#### Available Columns
- Image preview
- Title & SKU
- Quantity
- Current Price
- Minimum Price (editable inline)
- Price Reduction toggle (Active/Paused)
- Strategy selector (dropdown)
- View Count
- Watch Count
- Listing Age (auto-calculated)
- Actions (View, Reduce Price, Remove)

#### Listing Management Actions
- Edit minimum price inline
- Toggle price reduction monitoring
- Change reduction strategy
- Manual price reduction
- Remove listing from monitoring
- View detailed listing page

#### Status Filtering
- Active listings
- Ended listings
- All listings

#### Responsive Design
- Desktop: Full table view with all features
- Mobile: Card-based layout
- Touch-friendly controls

#### Data Synchronization
- Optimistic UI updates
- Real-time data refresh
- Conflict resolution

---

### 4. Auto-List Page (`/auto-list`)

**File:** `frontend/src/pages/AutoList.jsx`

#### 4-Step Workflow
1. **Select Input Method**
2. **Input Data**
3. **Review & Select Items**
4. **Create eBay Listings**

#### Three Input Methods

**A. File Upload:**
- Drag-and-drop interface
- Supported formats: .xls, .xlsx, .csv
- Automatic column mapping
- Expected columns: ASIN, SKU, FNSKU, Product Name, Quantity, Condition, Price, Category
- Amazon removal order support
- File validation

**B. Manual ASIN Entry:**
- Batch ASIN input (one per line)
- ASIN validation (10 characters)
- Keepa API integration for product data
- Automatic title fetching
- Automatic price fetching
- Automatic image fetching
- Error handling for unavailable products

**C. Google Sheets Integration:**
- Public Google Sheets URL input
- Automatic CSV export conversion
- Column header mapping
- Real-time data import
- Row validation

#### Data Processing
- Automatic eBay price calculation based on condition
- Condition multipliers:
  - New: 1.2x
  - Like New: 1.1x
  - Very Good: 0.95x
  - Good: 0.85x
  - Acceptable: 0.75x
- eBay title optimization (80 character limit)
- Category mapping (Amazon → eBay)
- Description generation

#### Review & Selection
- Item selection checkboxes
- Select All / Deselect All
- View suggested eBay prices
- Product details review
- Quantity management
- Price adjustment

#### Bulk Operations
- Multi-item selection
- Batch listing creation
- Progress tracking
- Success/error notifications

#### Mobile Responsive
- Card view on mobile
- Table view on desktop
- Touch-friendly controls

---

### 5. Strategies Page (`/strategies`)

**File:** `frontend/src/pages/Strategies.jsx`

#### Strategy Management
- Create new price reduction rules
- Edit existing rules
- Delete rules (with usage protection)
- Pause/Activate rules

#### Rule Configuration
- **Rule Name:** Custom descriptive name
- **Reduction Type:**
  - Percentage (%)
  - Dollar Amount ($)
- **Reduction Amount:**
  - Percentage: 1-50%
  - Dollar: $1-$999
- **Frequency:** 1-365 days

#### Rule Tracking
- View how many listings use each rule
- Creation date display
- Active/Inactive status indicator
- Usage count prevents deletion (safety feature)

#### Modal Interface
- Create rule modal
- Inline editing mode
- Form validation
- Cancel/Save options
- Confirmation dialogs

#### Notifications
- Success confirmations
- Error messages
- Auto-dismiss after 5 seconds
- Action-specific messaging

#### Data Persistence
- Local state management
- Shared data store integration
- Real-time updates across pages

---

### 6. Analytics Page (`/analytics`)

**File:** `frontend/src/pages/Analytics.jsx`

#### Market Analysis
- Select listing for analysis
- View market data:
  - Average Price
  - Median Price
  - Price Distribution (Low/Medium/High)
- Competitor analysis

#### Price Recommendations
- Competitive pricing suggestion
- Aggressive pricing suggestion
- Quick sale pricing suggestion
- Profit margin calculations

#### Listing Selection
- View all active listings
- Click to select for analysis
- Current price display
- Historical price trends

#### Demo Mode
- Demo analytics cards
- Sample market data
- Feature preview

#### Real-time Analysis
- Analyze Market button
- Loading states
- Error handling
- Data refresh

#### Notifications
- Success/error messages
- Auto-dismiss alerts
- Fixed position notifications

---

### 7. Account Page (`/account`)

**File:** `frontend/src/pages/Account.jsx`

#### Tab Navigation
- Profile
- Preferences
- Security
- Billing
- Integrations

#### Profile Tab
**Editable Fields:**
- Full Name
- Email (read-only display)
- Default Reduction Strategy
- Default Reduction Percentage (1-50%)
- Default Reduction Interval (1-30 days)

**Edit Workflow:**
- Edit/Save/Cancel buttons
- Form validation
- Success confirmations
- Error handling

#### Preferences Tab
**Notification Settings:**
- Email Notifications toggle
- Price Reduction Alerts toggle
- Edit/Save/Cancel workflow
- Real-time preference updates

#### Security Tab
**Password Management:**
- Current password entry
- New password (minimum 6 characters)
- Confirm password validation
- Update password button
- Password strength indicator

#### Billing Tab
**Subscription Display:**
- Current plan (Free/Starter/Professional/Enterprise)
- Listing limits
- Subscription status
- Expiration date
- Billing history

**Plan Options:**
- **Starter:** $9/mo, 50 listings
- **Professional:** $29/mo, 500 listings
- **Enterprise:** $99/mo, unlimited listings
- Feature comparisons
- Upgrade/downgrade options

#### Integrations Tab

**eBay Developer Integration (Collapsible Section):**
- OAuth connection flow
- Connection status display (Connected/Disconnected)
- eBay username display
- Disconnect option
- Success/error messages
- Redirect URI configuration instructions
- EbayConnect component integration
- PKCE OAuth flow support

**Keepa Integration (Collapsible Section):**

*Step-by-Step Setup Guide:*
1. Create Keepa account
2. Subscribe to API access
3. Generate API key
4. Enter API key

*API Key Management:*
- Secure password input field
- Show/hide toggle
- Save/Update API key button
- Test connection button
- Key validation

*Connection Status:*
- Connected/Not Connected indicator
- Token count display
- Last test status
- Auto-test on page load

*Documentation Links:*
- API documentation
- Forums & support
- Browser extension
- Pricing plans

*Features List:*
- Price history tracking
- Sales rank tracking
- Product finder
- Competitor analysis

**Other Integrations (Collapsible Section):**
- Email Notifications (Configure button)
- Analytics Export (Setup button)
- Webhooks (Coming Soon)
- Zapier Integration (Coming Soon)

#### Data & Privacy
- Export My Data (JSON download)
- Delete Account (with double confirmation)
- Data retention policy
- Privacy settings

---

### 8. Admin Settings Page (`/admin-settings`)

**File:** `frontend/src/pages/AdminSettings.jsx`

#### eBay Developer Credentials Management
- **App ID (Client ID):**
  - Text input field
  - Required field validation
  - Format validation

- **Cert ID (Client Secret):**
  - Password input with show/hide toggle
  - Required field validation
  - Encryption notice
  - Secure storage confirmation

- **Dev ID (Optional):**
  - Text input field
  - Optional field indicator

#### Setup Instructions
- Link to developer.ebay.com
- Step-by-step credential retrieval guide
- Redirect URI configuration instructions
- Environment-specific setup (sandbox vs production)

#### Validation & Security
- Required field validation
- Placeholder value detection
- Credential format checking
- Encrypted storage notice
- Secure credential handling

#### Workflow
- Fetch existing credentials on load
- Update credentials
- Auto-redirect to Account page after successful save
- Success/error notifications
- Loading states

#### Access Control
- Authentication required
- Auto-redirect to login if not authenticated
- Admin-only access (future enhancement)

---

## Global Features

### Navigation System

#### Desktop Navigation
- Full navigation bar
- Active route highlighting (blue background)
- Smooth hover transitions
- Logo/branding display
- User greeting
- Logout functionality

#### Mobile Navigation
- Responsive hamburger menu
- Slide-out menu with backdrop overlay
- Closes on route change
- Closes when clicking outside menu
- Touch-friendly controls
- Same navigation links as desktop
- Icons for each menu item
- Separate logout button section

#### Navigation Links (All Platforms)
- Dashboard (`/`)
- Listings (`/listings`)
- Auto-List (`/auto-list`)
- Strategies (`/strategies`)
- Analytics (`/analytics`)
- Account (`/account`)
- Logout (action, not route)

### Authentication & State Management

#### Authentication Features
- Supabase authentication integration
- LocalStorage persistence
- Session management
- Auto-redirect on logout
- Remember me functionality
- Token refresh handling

#### State Management
- React Query for API calls
- Optimistic UI updates
- Smart caching strategies
- Auto-refetch on reconnect
- Mutation handling
- Query invalidation
- Real-time data synchronization

### UI/UX Features

#### Responsive Design
- Mobile-first approach
- Tablet breakpoints
- Desktop optimization
- Touch-friendly controls
- Adaptive layouts
- Responsive tables (table → cards)

#### Notification System
- Toast notifications
- Success messages (green)
- Error messages (red)
- Info messages (blue)
- Auto-dismiss (5 seconds)
- Manual dismiss option
- Fixed position (top-right)
- Stacking support

#### Loading States
- Skeleton screens
- Spinner animations
- Progress indicators
- Loading text
- Suspense boundaries
- Lazy loading for code splitting

#### Error Handling
- User-friendly error messages
- Fallback UI
- Retry mechanisms
- Error boundaries
- Console error logging
- Network error handling

### Performance Optimizations

#### Code Splitting
- Lazy loading for all page components
- Dynamic imports
- Suspense fallbacks
- Route-based splitting

#### Data Management
- Smart caching (6-hour freshness, 12-hour cache for listings)
- Optimistic updates
- Debounced search
- Throttled filters
- Pagination support (where applicable)

#### Asset Optimization
- Image lazy loading
- CDN delivery
- Minified bundles
- Tree shaking

---

## Technical Architecture

### Frontend Stack
- **Framework:** React 18
- **Build Tool:** Vite
- **Routing:** React Router v6
- **State Management:** React Query + Context API
- **Forms:** react-hook-form
- **Styling:** Tailwind CSS
- **HTTP Client:** Fetch API

### Backend Integration
- **API:** Netlify Serverless Functions
- **Database:** Supabase (PostgreSQL)
- **Authentication:** Supabase Auth
- **File Storage:** Supabase Storage (future)

### Key Libraries
- `@tanstack/react-query` - Data fetching and caching
- `react-hook-form` - Form management
- `react-router-dom` - Routing
- `@supabase/supabase-js` - Supabase client

### Security Features
- CSRF protection via OAuth state
- AES-256-CBC encryption for sensitive tokens
- Row Level Security (RLS) on database
- CORS restricted to production domain
- PKCE for OAuth code exchange
- XSS protection
- Input sanitization

---

## User Actions Summary

### By Page

| Page | Key User Actions |
|------|-----------------|
| **Login** | Sign in, Sign up, Reset password, Demo login, Toggle between login/signup/reset views |
| **Dashboard** | View statistics, Configure price rules, Quick navigation to other pages |
| **Listings** | Search, Filter, Sort, Edit minimum price, Toggle monitoring, Change strategy, Sync from eBay, View details, Reduce price manually, Remove listing |
| **Auto-List** | Upload file, Enter ASINs, Connect Google Sheets, Map columns, Select items, Configure listings, Create eBay listings in bulk |
| **Strategies** | Create price reduction rule, Edit rule, Delete rule, Pause/Activate rule, View rule usage |
| **Analytics** | Select listing, Analyze market data, View price recommendations, Compare competitors |
| **Account** | Edit profile, Update preferences, Change password, Manage billing/subscription, Connect eBay (OAuth), Configure Keepa API, Manage integrations, Export data, Delete account |
| **Admin Settings** | Enter eBay App ID, Enter eBay Cert ID, Enter eBay Dev ID, Save credentials, View setup instructions |

### By Category

#### Data Management
- Import listings from eBay
- Sync listings manually
- Auto-sync every 6 hours
- Remove listings from monitoring
- Export user data (JSON)

#### Price Management
- Configure price reduction strategies
- Set minimum prices
- Manual price reductions
- Automated price drops
- View price history

#### Integration Management
- Connect eBay account (OAuth)
- Disconnect eBay account
- Configure Keepa API
- Save eBay developer credentials
- Test API connections

#### Account Management
- Update profile information
- Change password
- Manage notification preferences
- View/change billing plan
- Delete account

#### Analysis & Reporting
- View market analytics
- Get price recommendations
- Track statistics (views, watches, savings)
- Monitor listing performance

---

## Feature Implementation Status

### Fully Implemented ✅
- User authentication (login, signup, password reset)
- eBay OAuth integration with PKCE
- Listings import and sync
- Advanced filtering and search
- Price reduction strategies
- Manual price reduction
- Keepa API integration
- Account settings management
- Responsive design (mobile/desktop)
- Toast notifications

### Partially Implemented 🚧
- Dashboard (two versions exist - simple and advanced)
- Analytics (demo mode vs real data)
- Auto-list (file upload works, Google Sheets needs testing)

### Planned/Coming Soon 📋
- Webhooks integration
- Zapier integration
- Automated scheduled price reductions (backend exists, UI monitoring needed)
- Advanced analytics charts
- Billing/payment processing
- Email notification system
- Export to CSV/Excel

---

## Testing Requirements

### Manual Testing Checklist
- [ ] OAuth flow: Connect eBay account
- [ ] OAuth flow: Disconnect eBay account
- [ ] Listings sync: Import from eBay
- [ ] Listings sync: Manual sync trigger
- [ ] Listings: Search functionality
- [ ] Listings: Filter by multiple criteria
- [ ] Listings: Sort columns
- [ ] Listings: Edit minimum price
- [ ] Listings: Toggle price reduction
- [ ] Listings: Change strategy
- [ ] Price reduction: Manual trigger
- [ ] Strategies: Create new rule
- [ ] Strategies: Edit rule
- [ ] Strategies: Delete rule (with usage check)
- [ ] Auto-list: File upload
- [ ] Auto-list: ASIN entry with Keepa
- [ ] Auto-list: Google Sheets import
- [ ] Analytics: Market analysis
- [ ] Account: Update profile
- [ ] Account: Change password
- [ ] Account: Keepa API connection
- [ ] Admin: Save eBay credentials
- [ ] Mobile: Navigation menu
- [ ] Mobile: Responsive layouts
- [ ] Mobile: Touch interactions

### Automated Testing (Recommended)
- Unit tests for utility functions
- Integration tests for API calls
- E2E tests for critical flows (OAuth, listing sync, price reduction)
- Accessibility testing
- Performance testing

---

## Browser Support

### Supported Browsers
- Chrome (latest 2 versions)
- Firefox (latest 2 versions)
- Safari (latest 2 versions)
- Edge (latest 2 versions)

### Mobile Browsers
- iOS Safari (latest)
- Chrome Mobile (latest)
- Firefox Mobile (latest)

---

## Accessibility Requirements

### Current Implementation
- Semantic HTML
- Keyboard navigation
- Focus indicators
- ARIA labels (partial)

### Recommended Enhancements
- Screen reader testing
- WCAG 2.1 AA compliance
- Color contrast verification
- Keyboard-only navigation testing
- ARIA improvements

---

## Performance Metrics

### Current Optimization
- Code splitting (lazy loading)
- Smart caching (6-hour/12-hour strategy)
- Optimistic UI updates
- Debounced search
- LocalStorage for settings

### Target Metrics
- First Contentful Paint: < 1.5s
- Time to Interactive: < 3.5s
- Largest Contentful Paint: < 2.5s
- Cumulative Layout Shift: < 0.1

---

## Known Limitations & Future Enhancements

### Current Limitations
1. Local development requires Netlify environment (no Supabase access)
2. Two dashboard versions exist (needs consolidation)
3. Settings page exists but not in routing (deprecated?)
4. No real billing integration (UI only)
5. Auto-list Google Sheets needs more testing

### Future Enhancements
1. Real-time collaborative features
2. Advanced analytics dashboard
3. Mobile app (React Native)
4. Browser extension for quick listing
5. AI-powered pricing recommendations
6. Bulk editing capabilities
7. CSV export for listings
8. Webhook event system
9. API for third-party integrations
10. Multi-user accounts (team features)

---

## Changelog

### Version 1.0 (2025-10-03)
- Initial requirements document
- Complete feature inventory
- Page-by-page breakdown
- Technical architecture documentation
- Testing requirements defined

---

## Document Maintenance

**Last Reviewed:** 2025-10-03
**Next Review:** When major features are added/changed
**Maintained By:** Development Team
**Location:** `docs/UI_FEATURES_REQUIREMENTS.md`

---

## References

- Project Architecture: `CLAUDE.md`
- Database Schema: `supabase-schema.sql`
- OAuth Implementation: `research/2025-10-02_integration_review.md`
- API Documentation: `netlify/functions/README.md` (if exists)

---

**End of Document**
