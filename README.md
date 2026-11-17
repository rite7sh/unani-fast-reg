# Unani Hospital OPD Management System

A desktop OPD (Outpatient Department) registration and reporting application for a Unani hospital, built with Electron, React, TypeScript, and a local SQLite database. Designed for low-end Windows desktop PCs used at hospital reception and by hospital administration.

## What it does

- **Reception** registers walk-in patients, generates the C.R. (registration) number, and prints an OPD slip — works fully offline, saving immediately to a local database.
- **Admin** manages Departments and Consultants, edits patient records, views Dashboard analytics and Reports, and configures backups.
- **Local Backup** creates verified daily and on-demand snapshots of the local database, with configurable storage location and safe restore.
- **Cloud Backup** optionally uploads verified backup snapshots to off-site storage for disaster recovery.
- **Data Sync** optionally keeps Reception's and Admin's local databases up to date with each other through a central server, on a schedule or on demand.

Cloud Backup and Data Sync are independent of each other and both independent of core registration — the application is fully usable offline with only the local database.

## Development

Requires Node.js and npm.

```sh
npm install
npm run dev
```

This starts the Vite dev server and an Electron window pointed at it.

### Building

```sh
npm run build      # builds the frontend and the Electron main process
npm run dist:win   # packages a Windows installer (electron-builder)
```

The optional server-side component for Cloud Backup and Data Sync lives in `server/` and is a separate Node/Express project — see `server/.env.example` for its configuration.
