// Ícones SVG usados pelas views
const I = ({ d, className, children }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true">{d ? <path d={d} fill="currentColor" /> : children}</svg>
);

export const Ghost = ({ className }) => (
  <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
    <path d="M12 56V28a20 20 0 0 1 40 0v28l-6.7-5-6.6 5-6.7-5-6.7 5-6.6-5Z" fill="currentColor" />
    <circle cx="25" cy="29" r="4" fill="#0b0a10" /><circle cx="39" cy="29" r="4" fill="#0b0a10" />
  </svg>
);
export const Search = p => <I {...p} d="M10.5 3a7.5 7.5 0 0 1 5.96 12.06l4.24 4.24-1.4 1.4-4.24-4.24A7.5 7.5 0 1 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z" />;
export const Play = p => <I {...p} d="M8 5v14l11-7z" />;
export const Pause = p => <I {...p} d="M6 5h4v14H6zm8 0h4v14h-4z" />;
export const Info = p => <I {...p} d="M11 10h2v7h-2zm0-3h2v2h-2zm1-5a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z" />;
export const Restart = p => <I {...p} d="M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z" />;
export const Back = p => <I {...p} d="M15.4 7.4 14 6l-6 6 6 6 1.4-1.4L10.8 12z" />;
export const Rewind = p => (
  <I {...p}><path d="M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z" fill="currentColor" />
    <text x="12" y="16.5" fontSize="7" textAnchor="middle" fill="currentColor" fontFamily="Arial" fontWeight="700">10</text></I>
);
export const Forward = p => (
  <I {...p}><path d="M12 5V1l5 5-5 5V7a6 6 0 1 0 6 6h2a8 8 0 1 1-8-8z" fill="currentColor" />
    <text x="12" y="16.5" fontSize="7" textAnchor="middle" fill="currentColor" fontFamily="Arial" fontWeight="700">10</text></I>
);
export const Volume = p => <I {...p} d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z" />;
export const Muted = p => <I {...p} d="M3 9v6h4l5 5V4L7 9H3zm18.3 6.9-1.4 1.4L17 14.4l-2.9 2.9-1.4-1.4 2.9-2.9-2.9-2.9 1.4-1.4 2.9 2.9 2.9-2.9 1.4 1.4-2.9 2.9z" />;
export const Tracks = p => <I {...p} d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zM4 12h4v2H4v-2zm10 6H4v-2h10v2zm6 0h-4v-2h4v2zm0-4H10v-2h10v2z" />;
export const FullEnter = p => <I {...p} d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />;
export const FullExit = p => <I {...p} d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />;
