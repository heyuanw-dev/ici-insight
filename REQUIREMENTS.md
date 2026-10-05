# ICI AI Insight Hub — Website Requirements Document

## 1. Project Overview

### Project Name

**ICI AI Insight Hub**

Working title. The name may be changed later without affecting the application architecture.


### Purpose

ICI AI Insight Hub is an internal website for organizing the ICI Lab's weekly AI insight presentations.

Every Tuesday, one or more team members may present a recent AI technology, research paper, product, technique, industry development, or other relevant topic.

Each presentation has one presenter. A date may contain multiple presentation slots, with one presentation per slot.

The website should allow employees to:

- See upcoming presentation dates and topics.
- Volunteer for an available presentation slot.
- Register their presentation topic.
- Edit, reschedule, or cancel their own upcoming presentation, including on its scheduled date.
- Upload or replace their own presentation slides, including after completion.
- Browse previous presentations.
- Search and filter the presentation archive.
- View archived presentation slides in the browser.
- Download the original presentation files when needed.

The website is intended to serve as both a **presentation scheduling system** and a **long-term internal knowledge archive**.

### Primary Goals

1. Make it easy for team members to volunteer for available presentation slots.
2. Make upcoming presentations visible to the whole team.
3. Create a searchable archive of previous AI presentations.
4. Preserve presentation files for future reference.
5. Keep the system simple enough that employees will actually use it.

### Target Audience

Approximately 30–50 internal company employees.

The website is not intended for public access.

---

## 2. User Roles and Authentication

The application should require users to sign in before accessing internal content.

### Regular User

A regular employee should be able to:

- View upcoming presentations.
- View available presentation dates and slots.
- Register themselves for an available slot on the current date or a future date.
- Add a required presentation title and optional category, description, and reference URL.
- Edit their own upcoming presentation content, including on its scheduled date.
- Reschedule their own upcoming presentation to an available slot on the current date or a future date.
- Cancel their own upcoming presentation, including on its scheduled date.
- Upload or replace slides for their own presentation, including after completion.
- View historical presentations.
- Search and filter historical presentations.
- View and download presentation files.

Regular users cannot edit completed presentation metadata, including its title, description, category, reference URL, presenter, or date. Uploading or replacing their own slides is a separate permission and remains allowed after completion.

### Administrator

An administrator should additionally be able to:

- Create or modify presentation dates and slots, including multiple slots on the same day.
- Extend the schedule and close dates or slots, including holidays.
- Edit any presentation.
- Soft-delete or cancel any presentation.
- Upload or replace archived presentation files.
- Correct historical presentation information.
- Manage unusual scheduling conflicts.

For the MVP, there does not need to be a complex admin dashboard unless it is necessary. Admin functionality can be incorporated into the existing pages.

### Authentication

Use Supabase Auth with invite-only accounts. Initial users and administrators are provisioned through Supabase administration. Public self-registration is not allowed.

Keep the authentication integration simple enough to replace with corporate SSO later.

Public anonymous users should not have access to presentation information or files.

---

## 3. Presentation Data

Each presentation record should contain:

- Required presentation title
- Presenter name
- Presenter user ID
- Presentation slot and date
- Optional short description or abstract, with a maximum of 500 characters
- Optional topic/category
- One optional external reference URL
- Presentation status
- Original PowerPoint file, when uploaded; not required to register or complete a presentation
- Optional PDF preview file
- Created date
- Last updated date
- Cancellation date, when cancelled
- Deletion date, when soft-deleted

Cards and detail pages should omit optional category, description, and reference information when it has not been provided.

### Presentation Status

Possible statuses:

- Upcoming
- Completed
- Cancelled

Use the **America/Vancouver** IANA timezone for all presentation dates, date comparisons, and day boundaries, including daylight saving time changes.

A non-cancelled, non-deleted presentation remains Upcoming throughout its scheduled local date. It automatically becomes Completed and appears in the Presentation Archive at the start of the following local date (00:00 in America/Vancouver). Completion does not depend on whether slides have been uploaded.

Same-day booking, metadata editing, rescheduling, and cancellation are allowed for regular users on their own upcoming presentations. Once the local presentation date has passed, metadata changes require an administrator; presenters may still upload or replace their own slides.

### Cancellation and Deletion

Cancellation sets the presentation to Cancelled, retains its record and files, and frees its slot for another booking if the slot is open and its date has not passed. Cancelled presentations do not appear as upcoming presentations or completed archive items and must not become Completed automatically.

Deletion is an administrator-only soft deletion for the MVP. It hides the presentation from normal application pages, search, preview, and download access, and releases its booking without immediately destroying its record or archived files. A past or closed slot remains unavailable for regular booking even after cancellation or deletion.

Soft deletion is separate from the three presentation statuses. Permanent deletion and file-retention policies can be defined later.

---

## 4. Presentation Categories

Presenters should optionally be able to categorize their presentation.

Example categories:

- AI Research
- Large Language Models
- Agents
- Computer Vision
- Multimodal AI
- Robotics
- AI Infrastructure
- AI Tools
- AI Safety
- Industry News
- Product / Demo
- Other

Categories should be easy to modify later.

---

## 5. Pages

The initial application should contain three primary pages:

1. Home
2. Upcoming / Schedule
3. Presentation Archive

A persistent navigation bar should allow users to move between these pages.

The signed-in user's name or profile should also be visible in the navigation area.

---

## 6. Home Page

The Home page should quickly explain the purpose of the website.

It should contain:

### Hero Section

Example message:

**ICI AI Insight Hub**

Discover, share, and revisit the latest developments in artificial intelligence.

A short description should explain that ICI Lab members meet every Tuesday to share recent AI research, technologies, and developments.

### Primary Actions

Include prominent buttons for:

**View Upcoming Presentations**

and

**Browse Presentation Archive**

### Next Presentation

Display the next scheduled presentation prominently.

Show:

- Presentation title
- Presenter
- Date
- Category
- Short description

If the next open presentation date has an unbooked slot, show the slot even if nobody has booked that date yet, or alongside any booked presentations for that date:

**Presentation slot available**

with a button:

**Volunteer to Present**

Do not offer closed holiday dates or closed slots for volunteering. Multiple slots on a date should remain distinguishable.

### Upcoming Presentations

Show approximately the next 3–5 scheduled presentations.

---

## 7. Upcoming / Schedule Page

This page is used to see presentation dates from the current local date onward and volunteer for an available slot.

The page should clearly distinguish between:

**Available slots**

and

**Booked presentations**

Closed dates or slots should be clearly marked as unavailable and must not offer a booking action.

### Presentation Schedule

Display scheduled dates chronologically, including the current local date. Tuesdays are the normal presentation day; also display any other dates created by an administrator.

Group slots by date. Each date can contain multiple slots, and each open slot should show either:

**Available**

or the scheduled presentation information.

For booked slots, show:

- Date
- Presenter
- Presentation title
- Category
- Short description

For available slots, show a:

**Volunteer for this slot**

button.

### Schedule Horizon

Initially create six months of weekly Tuesday slots, with one slot per Tuesday by default. Administrators may add additional slots on the same day or create slots on other dates.

Show the next 12 weeks by default, starting from the current local date, and allow users to view later dates already created in the schedule.

Administrators can extend the schedule and close dates or individual slots, including holidays. Extending the schedule must preserve existing bookings and closures without creating duplicate slots or reopening closed dates. Closing a date or slot must not silently cancel or delete an existing presentation; administrators must explicitly reschedule or cancel affected bookings.

### Presentation Registration Form

When a user chooses an available slot, display a form containing:

**Presentation date and slot**

Automatically populated from the selected slot. Each presentation has one presenter, set to the signed-in user during regular registration.

**Presentation title**

Required.

**Category**

Optional.

**Short description / abstract**

Optional, with a maximum length of 500 characters enforced on the server.

**Reference URL**

One optional URL.

Example: research paper, GitHub repository, article, product page, or demo.

### Booking Rules

For the MVP:

- Presentations normally occur every Tuesday.
- Each presentation has exactly one presenter.
- A date may contain multiple slots. Initially create one slot per Tuesday; administrators may add more.
- Each slot can hold at most one presentation that is neither cancelled nor soft-deleted. A booked slot does not prevent users from booking another available slot on the same date.
- Regular users may book open, available slots on the current local date or a future date. Past dates and closed slots cannot be booked by regular users.
- The backend and database must enforce slot availability even when users book or reschedule simultaneously.
- Users may edit the content of their own upcoming presentation, including on its scheduled date.
- Users may change the date of their own upcoming presentation by selecting another open, available slot on the current local date or a future date.
- Rescheduling must reserve the destination slot and release the original slot atomically. If the destination becomes unavailable, keep the original booking and show a clear error.
- Users may cancel their own upcoming presentation, including on its scheduled date. Cancellation retains the record and frees the slot.
- Completed presentation metadata cannot be edited, rescheduled, or cancelled by regular users. Presenters may still upload or replace their own slides after completion.
- Administrators may edit any presentation, correct historical metadata, manage dates and closures, and cancel or soft-delete presentations. They must still preserve the one-presentation-per-slot constraint; additional presentations require additional slots.

Dates, times, availability checks, and editing cutoffs must use **America/Vancouver**, not the browser's or hosting server's timezone.

---

## 8. Presentation Archive Page

The archive contains all completed presentations that have not been soft-deleted. Cancelled presentations are excluded.

Presentations should be displayed with the newest presentation first.

Each archive item should show:

- Presentation title
- Presenter
- Presentation date
- Category
- Short description
- Presentation file availability

### Search

Users should be able to search by:

- Presentation title
- Presenter
- Description
- Topic/category

Search should work without requiring an exact match.

### Filters

Users should be able to filter by:

- Presenter
- Category
- Year
- Date range if practical

The MVP does not require advanced AI-powered or semantic search.

### Presentation Detail View

Clicking a historical presentation should open a dedicated detail page or modal.

It should display:

- Title
- Presenter
- Presentation date
- Category
- Description
- Reference URL, when provided
- Slide preview
- Download button

---

## 9. Presentation File Storage

The primary archived file type will be Microsoft PowerPoint `.pptx`.

The original PowerPoint file should be stored so users can download it later.

### Browser Slide Viewing

Because browsers do not reliably render `.pptx` files directly, the application should use a PDF version for the browser preview.

For the MVP, support:

- Original `.pptx` upload for download/archive.
- `.pdf` upload for browser preview.

The presentation detail page should display the PDF directly within the browser.

Do **not** implement automatic PowerPoint-to-PDF conversion in the MVP unless specifically requested, as stated in Section 19.

The presenter may upload or replace both files for their own presentation, including after completion. Administrators may upload or replace files for any presentation.

File management is a separate permission from metadata editing. Uploading or replacing slides does not permit regular users to change completed presentation metadata. Slides are not required at registration, and a completed presentation remains in the archive while its files are missing.

The architecture should allow automatic conversion to be added later.

### File Restrictions

Suggested initial limits:

- PowerPoint: `.pptx`
- Preview: `.pdf`
- Maximum file size: 50 MB per file

These values should be configurable.

Files must only be accessible to authenticated users.

---

## 10. User Journeys

### Journey 1 — Volunteer for a Presentation

User signs in  
→ lands on Home page  
→ sees upcoming presentations  
→ clicks **View Schedule**  
→ finds an available slot on the current date or a future presentation date  
→ clicks **Volunteer to Present**  
→ enters a required title and optionally adds a category, description of up to 500 characters, and one reference URL  
→ submits  
→ receives confirmation  
→ presentation appears in the upcoming schedule.

### Journey 2 — Modify or Reschedule an Upcoming Presentation

User signs in  
→ opens Schedule page  
→ finds their upcoming presentation, including one scheduled for the current date  
→ clicks **Edit**  
→ updates its content or selects another available slot on the current date or a future date  
→ saves changes  
→ receives confirmation; if rescheduled, the new slot is booked and the original slot is freed.

If the destination slot is no longer available, the original booking remains unchanged and the user can select another slot.

### Journey 3 — Find a Previous Presentation

User signs in  
→ opens Presentation Archive  
→ searches for a keyword or presenter  
→ optionally applies filters  
→ selects a presentation  
→ reads the description when provided  
→ views the PDF slides in the browser when available  
→ optionally downloads the original PowerPoint when available.

### Journey 4 — Upload Slides

After a presentation is completed:

The presenter opens their own presentation, or an administrator opens any presentation  
→ uploads or replaces the original PowerPoint  
→ optionally uploads or replaces the PDF preview  
→ available files can be accessed from the presentation archive.

The presenter can manage these files while historical metadata remains editable only by an administrator.

### Journey 5 — Cancel an Upcoming Presentation

User signs in  
→ opens their own upcoming presentation, including on its scheduled date  
→ chooses **Cancel** and confirms  
→ the record is retained as Cancelled  
→ its slot becomes available again if it is open and its date has not passed.

---

## 11. Design Direction

### Corporate Branding

The website should visually align with Huawei's corporate identity where appropriate.

Use Huawei-approved logos, colors, fonts, and other brand assets if they are provided.

Do not attempt to recreate, modify, or approximate Huawei brand assets when official assets are available.

Use red, white, black, and neutral gray as the initial design direction. Company-specific branding requirements and approval processes are out of scope for now; proceed with this palette and any official assets already provided.

### Overall Style

Modern, professional, clean, and appropriate for an internal technology/research organization.

The website should feel like an internal knowledge platform rather than a marketing website.

Prioritize:

- Clear information hierarchy
- Readability
- Fast navigation
- Minimal unnecessary decoration
- Professional presentation of research content

### Brand Colors

Primary colors:

- Red
- White

Use neutral colors such as light gray, dark gray, and black where necessary for readability.

Red should primarily be used for:

- Primary actions
- Highlights
- Selected states
- Branding

Avoid using large amounts of bright red as page backgrounds.

### Layout

Prefer:

- Generous whitespace
- Cards for presentation summaries
- Clear typography
- Subtle borders
- Minimal shadows
- Simple animations only where they improve usability

Avoid excessive animations, gradients, glassmorphism, or visually distracting effects.

---

## 12. Responsive Design

The application must work correctly on:

- Desktop
- Tablet
- Mobile

Desktop is likely to be the primary usage environment, but mobile usability should remain fully supported.

Navigation, forms, search, filters, and slide viewing should adapt appropriately to smaller screens.

---

## 13. Technical Architecture

### Frontend / Full-Stack Framework

Use:

**Next.js + TypeScript + Tailwind CSS**

Use the current stable version of Next.js and the App Router unless there is a strong technical reason not to.

Prefer server-side functionality when appropriate rather than creating unnecessary client-side complexity.

### Database

Use:

**PostgreSQL**

For the initial deployment, use **Supabase PostgreSQL**.

The database should contain presentation metadata and user/application information.

Do not store PowerPoint or PDF binaries directly inside database tables.

### File Storage

Use:

**Supabase Storage** for the initial implementation.

Store PowerPoint and PDF files in private storage buckets.

Files should require authentication or signed URLs for access.

Use Supabase Storage for the MVP; an alternative storage provider is not part of the current scope.

### Authentication

Use **Supabase Auth** with invite-only accounts. Provision initial users and administrators through Supabase administration; disable public self-registration.

### Hosting

Use this initial architecture:

**Vercel**
→ Next.js application

**Supabase**
→ PostgreSQL database  
→ Authentication  
→ File storage

This minimizes infrastructure and operational complexity for a small internal application.

Company-specific infrastructure restrictions, data-region requirements, and deployment approvals are out of scope for now. Plan and implement the MVP using Vercel and Supabase.

---

## 14. Suggested Database Model

At minimum, the application will likely need the following entities.

### Users

Fields:

- id
- name
- email
- role
- created_at

### Presentation Slots

Fields:

- id
- presentation_date
- slot_number
- is_open
- created_at
- updated_at

Slots exist independently of presentations so the application can show available dates, support multiple slots per day, and preserve holiday closures. The combination of presentation_date and slot_number must be unique.

### Presentations

Fields:

- id
- slot_id
- title
- description (optional; maximum 500 characters)
- presenter_user_id
- category (optional)
- reference_url (one optional URL)
- status
- powerpoint_file_path (optional until uploaded)
- pdf_file_path (optional)
- cancelled_at (optional)
- deleted_at (optional; indicates soft deletion)
- created_at
- updated_at

The presentation date is obtained through its slot relationship. Each presentation references exactly one presenter and one slot. Enforce at most one non-cancelled, non-deleted presentation per slot at the database level; do not enforce uniqueness across the entire date.

Status may be derived from cancellation state and the slot's presentation date using America/Vancouver day boundaries. If status is stored, it must remain consistent with the automatic completion rules in Section 3. Soft-deleted records must be excluded from normal reads regardless of status.

The exact schema can be adjusted during implementation, including separate category and file-metadata tables. File paths reference private storage objects; binary files must not be stored in these tables.

---

## 15. Security

Because this is an internal company application:

- All application pages should require authentication except the login page.
- Presentation files must not be publicly accessible.
- Regular users may edit, reschedule, or cancel only their own upcoming presentations, including on the scheduled date. Completed presentation metadata requires an administrator.
- Presenters may upload or replace only their own presentation files, including after completion; administrators may manage files for any presentation.
- Booking and rescheduling must enforce slot availability and America/Vancouver date boundaries on the server/database.
- Soft-deleted presentations and their files must be hidden from normal application reads, previews, and downloads while retained in storage.
- Accounts must be invite-only, with initial users and administrators provisioned through Supabase administration.
- Administrative actions must require an administrator role.
- File uploads must validate file type and file size.
- User-provided text must be safely handled.
- Secrets and API credentials must never be committed to the repository.
- Environment variables should be used for credentials.
- Database access rules should enforce authorization on the server/database level rather than relying only on the UI.

---

## 16. Accessibility and Performance

The website should include:

- Semantic HTML
- Keyboard-accessible navigation
- Accessible form labels
- Appropriate color contrast
- Visible focus states
- Alt text where applicable
- Responsive layouts
- Optimized assets
- Reasonable loading states
- Clear error messages
- Clear success confirmation after forms are submitted

Because this is an authenticated internal application, public SEO is **not a priority**.

Do not spend significant development effort on SEO.

---

## 17. Empty, Loading, and Error States

The interface should handle common states gracefully.

Examples:

If there are no upcoming presentations:

**No presentations are currently scheduled. Be the first to volunteer.**

If search returns no results:

**No presentations match your search.**

If a file has not yet been uploaded:

**Slides are not yet available.**

When submitting forms:

Show a clear loading state and prevent accidental duplicate submissions.

If an operation fails:

Display a human-readable error message and allow the user to retry.

---

## 18. Success Criteria

The MVP will be considered successful when:

1. Invited employees can securely sign in; public self-registration is disabled.
2. Employees can see available and booked slots, including multiple slots on a date, with the next 12 weeks shown by default from an initial six-month schedule.
3. Employees can volunteer for an open, available slot on the current America/Vancouver date or a future date; closed and past slots cannot be booked by regular users.
4. Employees must supply a title and may optionally supply a category, a description of up to 500 characters, and one reference URL.
5. A slot cannot accidentally be booked twice, including during concurrent bookings or rescheduling; separate slots on the same date can each hold a presentation.
6. Employees can edit, reschedule, or cancel their own upcoming presentations, including on the scheduled date. Rescheduling frees the original slot only after successfully reserving the destination; cancellation retains the record and frees the slot.
7. Non-cancelled, non-deleted presentations automatically become Completed and appear in the archive at the following America/Vancouver midnight. Historical metadata is admin-only, while presenters can upload or replace their own slides after completion.
8. Users can search historical presentations.
9. Users can filter historical presentations.
10. Users can open a historical presentation and view its PDF slides in the browser.
11. Users can download the original PowerPoint file.
12. Presentation files are only available to authenticated employees.
13. The application works correctly on desktop, tablet, and mobile.
14. Normal page interactions feel fast and responsive.
15. The application provides understandable loading, empty, success, and error states.
16. Administrators can extend the schedule, add slots on the same day, and close holiday dates without silently changing existing bookings or reopening closed dates during schedule extension.
17. Administrator deletion uses soft deletion: the presentation and its files are hidden from normal application access while the record and archived files are retained.

---

## 19. MVP Scope

The first version should focus on the core presentation workflow.

### Included

- Presentation scheduling with multiple slots per day, an initial six-month weekly schedule, and a default 12-week view
- Presentation registration
- Presentation editing, rescheduling, and cancellation, including same-day changes
- Upcoming presentation display
- Historical archive
- Search and filters
- PowerPoint storage
- PDF slide preview
- Presenter upload/replacement of their own slides, including after completion
- Invite-only authentication through Supabase Auth
- Basic administrative permissions
- Schedule extension, holiday closures, and soft deletion

### Not Required for MVP

Do not implement unless specifically requested:

- AI-generated presentation summaries
- Semantic/vector search
- Comments
- Likes or reactions
- Presentation email notifications (authentication and invitation emails remain permitted)
- Slack/Teams notifications
- Automatic PowerPoint-to-PDF conversion
- Calendar synchronization
- Complex analytics dashboards
- Multiple presentation tracks (multiple slots on a single shared schedule are included in the MVP)
- Public presentation sharing
- Mobile application

The system architecture should not prevent these features from being added later.

---

## 20. Instructions for Codex

Treat this requirements document as the source of truth.

Before writing application code:

1. Read the complete requirements document.
2. Identify any contradictions or requirements that cannot reasonably be implemented.
3. Identify any important technical assumptions.
4. Propose the application architecture.
5. Propose the database schema.
6. Propose the page and route structure.
7. Propose the major reusable UI components.
8. Propose the authentication and authorization approach.
9. Propose the file-storage strategy.
10. Provide a short phased implementation plan.

Do not begin by building every feature simultaneously.

Implement the application in logical stages.

Suggested order:

**Phase 1:** Project setup, design system, navigation, and database schema.

**Phase 2:** Authentication and authorization.

**Phase 3:** Upcoming presentations, multiple slots per day, schedule horizon, and presentation booking.

**Phase 4:** Editing, rescheduling, and cancellation, including same-day changes.

**Phase 5:** Presentation archive, search, and filters.

**Phase 6:** PowerPoint/PDF upload and replacement, including after completion, plus download and browser preview.

**Phase 7:** Admin workflows for schedule extension, closures, historical corrections, and soft deletion, using authorization established in Phase 2.

**Phase 8:** Responsive design, accessibility, error handling, security review, and testing.

Prefer simple, maintainable solutions over unnecessary abstraction.

Do not introduce major third-party dependencies unless they solve a clear requirement.

Use TypeScript strictly and avoid `any` unless there is a documented reason.

Validate user input on the server.

Do not rely exclusively on client-side authorization.

Do not expose database credentials, service-role credentials, or storage secrets to the browser.

Create reusable components where appropriate, but do not over-engineer the component architecture.

The finished application should be responsive, accessible, secure, maintainable, visually polished, and suitable for production use.

Before declaring the project complete, verify every item under **Success Criteria** and report any requirements that remain incomplete.
