# Unani OPD Manager

Build a lightweight, professional desktop UI prototype for a Unani Hospital OPD Management System.

IMPORTANT CONTEXT:

This is a hospital reception application running on Windows desktop computers with a minimum target of:

- Intel Core i3 or equivalent

- 4 GB RAM

- 500 MB free disk space

Therefore PERFORMANCE IS A PRIORITY.

The UI must be visually polished and modern, but extremely lightweight. Avoid unnecessary animations, gradients, glassmorphism, huge images, video, complex charts, excessive shadows, heavy component libraries, or decorative elements that provide no functional value.

This is NOT a consumer SaaS dashboard. It is a practical hospital reception application used repeatedly throughout the day by non-technical staff.

SOURCE OF TRUTH:

Follow the provided Unani Hospital OPD System proposal for the functional requirements.

ONE APPROVED CHANGE:

Remove C.R. No. completely from the system. Do not show it anywhere.

FOR THIS PROTOTYPE ONLY:

Build only these two screens:

1. Employee Login

2. Employee OPD Registration

Do NOT build the admin dashboard, reports, cloud sync, server management, employee management, or other future modules yet.

==================================================

DESIGN DIRECTION

==================================================

Create a clean, calm, professional hospital interface.

Visual character:

- White / very light neutral background

- Dark green as the primary hospital color

- Subtle light green accents

- High readability

- Compact spacing

- Clear hierarchy

- Professional typography

- Moderate border radius

- Very subtle shadows only where useful

- No excessive rounded "startup SaaS" styling

- No visual clutter

The application should feel:

"Fast hospital desktop software"

rather than:

"Marketing website / modern SaaS dashboard"

The UI should look good on approximately 1366x768 and 1920x1080 desktop screens.

Do not design primarily for mobile. This is a Windows desktop application.

==================================================

SCREEN 1 — EMPLOYEE LOGIN

==================================================

Create a simple login screen.

Include:

- Unani Hospital branding

- "OPD Management System"

- Employee ID field

- Password field

- Show/hide password control

- Sign In button

- Small professional footer/version text

Keep the login screen visually minimal.

Do not add:

- Social login

- Registration

- Forgot-password workflows yet

- Marketing copy

- Unnecessary illustrations

The login should immediately communicate that this is an internal hospital application.

==================================================

SCREEN 2 — EMPLOYEE OPD REGISTRATION

==================================================

After login, show the employee's main working screen.

This is the MOST IMPORTANT screen.

The employee's primary job is registering patients quickly, so minimize navigation and clicks.

Do NOT use a large sidebar.

Do NOT create unnecessary top navigation tabs.

The employee should be able to open the application and immediately begin registering a patient.

Create a compact application header containing:

- Unani Hospital

- OPD Management System

- Current date

- Logged-in employee name

- Logout

Main content:

Section heading:

"New OPD Registration"

Show these fields in this exact logical order:

1. OPD Registration No.

   - Automatically generated

   - Read-only

   - Example: OPD-2026-00423

2. Date

   - Automatically populated

   - Read-only

   - Example: 12/08/2026

3. Patient Name

   - Required

   - Text input

   - Support normal English/Roman text and Hindi/Devanagari text

   - Clear required indicator

4. Age

   - Required

   - Numeric input

   - Should support infant age format such as 0Y 8M

   - Keep the control compact

5. Gender

   - Required

   - Male

   - Female

   - Other

   - Use clear radio controls

6. Address

   - Required

   - Multi-line input

   - Intended for Village/Mohalla, Tehsil, District

   - Optional PIN code

7. Diagnosis

   - Required

   - Native-style searchable/select dropdown

   - Include representative Unani diagnoses from the proposal

   - Include "Other"

   - Selecting Other should reveal a small text field to specify the diagnosis

8. Consultant Name

   - Required

   - Dropdown

   - Display consultant name and designation

At the bottom provide two clear actions:

[ Clear ]

[ Save & Print ]

Make "Save & Print" the dominant primary action.

==================================================

UX / SPEED REQUIREMENTS

==================================================

This is a reception workflow.

Optimize for keyboard usage.

The form should support:

- Natural Tab order

- Enter to save

- Clear visual focus states

- Large enough input targets

- Minimal mouse movement

- Required-field validation

- Clear inline validation

- No disruptive animations

After successful registration, show a compact success state such as:

"Patient registered successfully"

with:

- OPD number

- Print confirmation

- [Print Again]

- [New Registration]

The user should be able to immediately start the next patient registration.

Do not force the employee through unnecessary confirmation dialogs.

==================================================

IMPORTANT UI BEHAVIOR TO REPRESENT

==================================================

Represent the following prototype behaviors visually, even if they are mocked for now:

- Automatic OPD number

- Automatic date

- Diagnosis dropdown

- "Other diagnosis" conditional field

- Consultant dropdown

- Required-field validation

- Save success state

- Print action

- New registration/reset

Do NOT implement a real database or backend in this prototype.

==================================================

PERFORMANCE REQUIREMENTS

==================================================

Keep the implementation extremely lightweight.

Prefer:

- React

- TypeScript

- Plain CSS or very lightweight styling

Avoid:

- Heavy UI component frameworks

- Large animation libraries

- Large icon libraries

- WebGL

- Background effects

- Images unless absolutely necessary

- Complex state management libraries

Use simple SVG icons or CSS where appropriate.

The eventual application will run inside Electron on low-end hospital PCs, so every design decision should consider startup time, memory usage, responsiveness, and simplicity.

==================================================

IMPORTANT

==================================================

Do not invent additional modules.

Do not create:

- Admin dashboard

- Reports

- Sync

- Cloud database

- Employee management

- Settings

- Analytics

- Notifications center

- Sidebar navigation with multiple modules

Those will be designed later.

For now, make the Employee Login and Employee OPD Registration experience exceptionally clean, fast, intuitive, and professional.

The result should look like a real production hospital desktop application, not a generic AI-generated dashboard.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/37fd212e-da79-4102-a7e7-1a77026bac88).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
