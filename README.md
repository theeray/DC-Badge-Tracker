# Digital Corps Badge Tracker

A responsive learning and mentor-endorsement workspace for Digital Corps at Bemidji State University.

Created and directed by **Eric Carlson**, with AI-assisted development and implementation.

## Live site

[Open the Digital Corps Badge Tracker](https://theeray.github.io/DC-Badge-Tracker/)

## What it includes

- Student and mentor views
- Progress tracking saved locally in the browser
- Skill pathways and tutorial links
- Practice project briefs and supplied asset downloads
- Digital Corps, BSU, BSU Athletics, and TAD brand resources
- Responsive desktop, tablet, and mobile layouts

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm ci
npm run dev
```

Create a production build with:

```bash
npm run build:pages
```

The repository publishes automatically through GitHub Actions after changes reach `main`.

## Data note

The published tracker currently stores progress and preview endorsements in the visitor's browser. Clearing browser storage resets that local state.

The account foundation defines three real roles—student mentee, student mentor, and faculty director—and reserves faculty-director access for Eric Carlson and Mitch Blessing. Secure authentication and shared data are the next implementation phase; they will enable real review assignments, persistent kudos, and comments without presenting local browser data as an account.
