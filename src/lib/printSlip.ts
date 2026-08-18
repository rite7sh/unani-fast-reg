// Shared print trigger for the OPD slip, used by both RegistrationScreen
// (freshly saved patient) and PatientHistoryScreen (reprinting an existing
// patient) — same PrintSlip component/layout in both cases, only the data
// source differs.
//
// Must wait for the bundled Urdu header font to finish loading before
// calling window.print(): with font-display: block, printing before the
// font is ready renders the Urdu header completely blank rather than
// falling back to a substitute font. .finally() guarantees print still
// happens even if the font load itself errors.
export function printSlip(): void {
  document.fonts
    .load('16pt "Noto Nastaliq Urdu"')
    .catch(() => undefined)
    .finally(() => window.print?.());
}
