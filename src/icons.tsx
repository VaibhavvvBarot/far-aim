// Small stroke icons drawn for this app
const P: Record<string, string> = {
  home: 'M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-4.5v-5.5h-5V21H5a1 1 0 0 1-1-1z',
  book: 'M5 4.5h5.5a2.5 2.5 0 0 1 2.5 2.5v13a2 2 0 0 0-2-2H5zM19 4.5h-3.5A2.5 2.5 0 0 0 13 7v13a2 2 0 0 1 2-2h4z',
  search: 'M10.5 4a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zM15.3 15.3 20 20',
  bookmark: 'M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z',
  bookmarkFill: 'M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z',
  gear: 'M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8',
  back: 'M15 5l-7 7 7 7',
  chevron: 'M9 6l6 6-6 6',
  note: 'M5 4h10l4 4v12H5zM15 4v4h4M8.5 12h7M8.5 15.5h5',
  find: 'M10 5a5 5 0 1 1 0 10 5 5 0 0 1 0-10zM13.7 13.7 18 18M4 20h7',
  share: 'M12 15V4M8 8l4-4 4 4M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6',
  text: 'M4 18 9 6l5 12M5.8 14h6.4M15 18l2.8-7 2.7 7M15.8 16h3.9',
  diff: 'M8 4v16M4 8h8M16 4v16M13 16h6',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  close: 'M6 6l12 12M18 6 6 18',
  trash: 'M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13',
  copy: 'M8 8h11v12H8zM5 16V4h11',
  print: 'M7 9V4h10v5M6 17H4v-7h16v7h-2M7 14h10v6H7z',
  plane: 'M21 15.5 13 11V5.5a1.5 1.5 0 0 0-3 0V11l-8 4.5V17l8-2.3V19l-2.2 1.6V22l3.7-1 3.7 1v-1.4L13 19v-4.3l8 2.3z',
  outline: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  speaker: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11',
  play: 'M8 5.5v13l10.5-6.5z',
  pause: 'M8 5.5h3v13H8zM13.5 5.5h3v13h-3z',
  rewind: 'M11.5 7 6 12l5.5 5M18 7l-5.5 5 5.5 5',
  forward: 'M12.5 7l5.5 5-5.5 5M6 7l5.5 5L6 17',
  cards: 'M7 4.5h10a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 17 20.5H7A1.5 1.5 0 0 1 5.5 19V6A1.5 1.5 0 0 1 7 4.5zM9 9h6M9 12.5h4',
  new: 'M12 4v4M12 16v4M4 12h4M16 12h4M6.3 6.3l2.8 2.8M14.9 14.9l2.8 2.8M6.3 17.7l2.8-2.8M14.9 9.1l2.8-2.8',
};
export function Icon({ name, size = 22 }: { name: string; size?: number }) {
  const fill = name === 'bookmarkFill' || name === 'plane' || name === 'play' || name === 'pause';
  return (
    <svg class="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"
      fill={fill ? 'currentColor' : 'none'} stroke={fill && name !== 'bookmarkFill' ? 'none' : 'currentColor'} stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
      <path d={P[name] || ''} />
    </svg>
  );
}
