// Brand.jsx — the app wordmark tile, shared by the home launcher and the studio.
export function Mark() {
  return (
    <svg viewBox="0 0 64 64" className="h-8 w-8">
      <rect width="64" height="64" rx="14" fill="#11203A" />
      <rect x="18" y="13" width="28" height="38" rx="3" fill="#F4F1EA" />
      <rect x="18" y="13" width="28" height="8" rx="3" fill="#A9853F" />
      <rect x="23" y="28" width="18" height="2.6" rx="1.3" fill="#11203A" />
      <rect x="23" y="34" width="18" height="2.6" rx="1.3" fill="#11203A" />
      <rect x="23" y="40" width="11" height="2.6" rx="1.3" fill="#A9853F" />
    </svg>
  );
}
