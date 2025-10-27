# Design Guidelines: Meta Ads Campaign Management Platform

## Design Approach

**Selected System**: Microsoft Fluent Design System
**Justification**: Enterprise productivity application requiring efficiency, clarity, and data-dense interfaces. Fluent's emphasis on information hierarchy, form design, and table management aligns perfectly with campaign management workflows.

**Core Design Principles**:
- Clarity over decoration: Every element serves a functional purpose
- Efficient workflows: Minimize clicks and cognitive load for repetitive tasks
- Progressive disclosure: Show complexity only when needed
- Consistent patterns: Users learn once, apply everywhere

---

## Typography System

**Font Family**: 
- Primary: 'Inter' (Google Fonts) - excellent readability for data-heavy screens
- Monospace: 'JetBrains Mono' (Google Fonts) - for IDs, API responses, technical data

**Type Scale**:
- Headings (H1): text-3xl font-semibold (dashboard titles, page headers)
- Headings (H2): text-2xl font-semibold (section headers, wizard steps)
- Headings (H3): text-xl font-medium (card titles, form sections)
- Body Large: text-base font-normal (primary content, form inputs)
- Body Small: text-sm font-normal (help text, secondary information)
- Caption: text-xs font-normal (timestamps, metadata, table footnotes)
- Labels: text-sm font-medium (form labels, navigation items)

**Line Height**: Use default Tailwind leading classes (leading-tight for headings, leading-normal for body)

---

## Layout System

**Spacing Primitives**: Use Tailwind units of **2, 4, 6, 8, 12, 16** consistently
- Component internal spacing: p-4, p-6
- Section spacing: py-8, py-12, py-16
- Card gaps: gap-4, gap-6
- Form field spacing: space-y-4
- Grid gaps: gap-6, gap-8

**Container Strategy**:
- Dashboard/App Shell: Full width with max-w-screen-2xl mx-auto px-6
- Forms/Wizards: max-w-3xl mx-auto for optimal focus
- Settings Panels: max-w-4xl mx-auto
- Modal dialogs: max-w-2xl

**Grid Systems**:
- Configuration cards: grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6
- Form layouts: Two-column on desktop (grid-cols-2 gap-6), single on mobile
- Dashboard metrics: grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4

---

## Component Library

### Navigation & Shell
**Top Navigation Bar**: 
- Height: h-16
- Sticky positioning (sticky top-0 z-50)
- Logo (left), navigation links (center), user menu + notifications (right)
- Shadow: shadow-sm

**Sidebar Navigation** (for main app areas):
- Width: w-64 (collapsible to w-16 on mobile)
- Fixed positioning on desktop, drawer on mobile
- Navigation groups with section headers (text-xs uppercase tracking-wide)
- Active state: subtle background treatment with left border accent

### Forms & Inputs
**Form Structure**:
- Clear section divisions with border separator
- Field groups with descriptive headers
- Consistent spacing (space-y-6 between sections, space-y-4 within sections)

**Input Fields**:
- Standard height: h-11
- Border: border rounded-lg
- Focus ring: ring-2 ring-offset-2
- Labels above inputs with required indicator (*)
- Help text below (text-sm with muted treatment)
- Error states with icon + message below field

**Select Dropdowns**:
- Match input height (h-11)
- Chevron icon on right
- Search functionality for long lists (leadgen_forms, resources)

**Buttons**:
- Primary: h-11 px-6 rounded-lg font-medium
- Secondary: h-11 px-6 rounded-lg font-medium with border
- Icon buttons: h-9 w-9 rounded-lg
- Ghost buttons: h-9 px-4 rounded-lg (no background)

**Multi-Step Wizard**:
- Progress indicator at top showing steps (1/2, 2/2)
- Step circles with connecting line
- Current step highlighted, completed steps with checkmark
- Navigation: Back (ghost button) + Continue/Finish (primary button)
- Max width: max-w-3xl

### Data Display
**Cards**:
- Standard padding: p-6
- Border with rounded-xl
- Shadow: shadow-sm on hover (hover:shadow-md transition)
- Header with title (text-lg font-semibold) + action button/menu

**Status Indicators**:
- Connection status (green/yellow/red): 
  - Circular badge (h-3 w-3) with animated pulse for pending
  - Icon + text label combination for accessibility
  - Positioned in card header or inline with resource name

**Tables** (Campaign list, configuration management):
- Sticky header (thead sticky top-0)
- Alternating row treatment for readability
- Row actions on hover (edit/delete icons)
- Cell padding: px-6 py-4
- Sortable columns with icon indicator
- Pagination controls at bottom (showing "1-10 of 50")

**Metrics Cards** (Dashboard KPIs):
- Compact size: p-4
- Large number display (text-3xl font-bold)
- Label below (text-sm)
- Optional trend indicator (+/- percentage with small arrow icon)
- Icon in top-right corner for visual identification

### Overlays
**Modal Dialogs**:
- Backdrop overlay with backdrop-blur-sm
- Modal: rounded-xl shadow-2xl
- Header: px-6 py-4 with border-b
- Content: px-6 py-4
- Footer: px-6 py-4 with border-t, buttons right-aligned

**Toast Notifications**:
- Fixed position (top-right): top-4 right-4
- Width: w-96
- Rounded: rounded-lg shadow-lg
- Auto-dismiss after 5s
- Types: success (checkmark icon), error (X icon), info (i icon), warning (! icon)
- Close button (X) in top-right

**Confirmation Dialogs**:
- Small modal (max-w-md)
- Icon at top (warning/question)
- Clear action buttons (Cancel + Confirm with destructive styling for delete actions)

---

## Page-Specific Layouts

### Dashboard
- Header with page title + date range selector (right-aligned)
- Metrics row (4 KPI cards in grid)
- Campaigns table with filters above (search + objective dropdown + status dropdown)
- Empty state when no campaigns: centered illustration + CTA button

### Onboarding Wizard
- Centered layout (max-w-3xl)
- Step indicator at top
- Large card with step content
- Connection test button with loading spinner
- Status feedback immediately visible after test

### Configuration/Resources Page
- Split layout: Sidebar menu (different resource types) + Main content area
- Resource list with add button in header
- Each resource card shows: name/label, IDs, edit/delete actions
- Form to add/edit opens in slide-over panel from right

### Campaign Form (Create/Edit)
- Sticky header with form title + Save/Discard buttons
- Scrollable content area
- Sections: Campaign Details, Targeting (with audience selector), Creative (with Drive folder selector), Budget & Schedule
- Conditional fields appear/hide based on objective selection
- Preview panel (optional on desktop > lg: split view)

---

## Icons
**Library**: Heroicons (via CDN)
- Use outline variant for navigation and neutral states
- Use solid variant for active states and filled indicators
- Common icons needed: check-circle, x-circle, exclamation-circle, cog, chart-bar, folder, link, users, calendar, currency-dollar

---

## Accessibility
- All form inputs have associated labels (not just placeholders)
- Focus indicators clearly visible (ring-2)
- Status indicators use icon + text (not color alone)
- Sufficient contrast ratios throughout
- Keyboard navigation supported (tab order, Enter to submit)
- Loading states announced with aria-live regions
- Error messages associated with fields via aria-describedby

---

## Animations
**Minimal and Purposeful**:
- Page transitions: None (instant navigation for productivity)
- Loading states: Subtle spinner (animate-spin) for async operations
- Hover states: shadow and scale (hover:shadow-md transition-shadow duration-200)
- Toast entrance: Slide from right (animate-slide-in-right)
- Status changes: Fade transition (transition-opacity duration-300)

**No Animations**:
- Parallax effects
- Scroll-triggered animations
- Decorative motion

---

## Images
This application does not require hero images or marketing visuals. Focus on:
- Placeholder illustrations for empty states (use Undraw or similar via CDN)
- Company logo in navigation
- User avatar in top-right menu
- Optional: small icons/illustrations in onboarding steps for visual guidance