// Vaibhav Barot's compass-rose mark, as used on his website
const ROSE: [string, string][] = [
  ['M12 12L12 1.5L13.3 10.7Z', '#E8C68A'], ['M12 12L13.3 10.7L22.5 12Z', '#6E4E1C'],
  ['M12 12L22.5 12L13.3 13.3Z', '#E8C68A'], ['M12 12L13.3 13.3L12 22.5Z', '#6E4E1C'],
  ['M12 12L12 22.5L10.7 13.3Z', '#E8C68A'], ['M12 12L10.7 13.3L1.5 12Z', '#6E4E1C'],
  ['M12 12L1.5 12L10.7 10.7Z', '#E8C68A'], ['M12 12L10.7 10.7L12 1.5Z', '#6E4E1C'],
];
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg class="logo" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <rect width="24" height="24" rx="5" fill="#16233A" />
      <g transform="translate(2.4 2.4) scale(0.8)">{ROSE.map(([d, f]) => <path d={d} fill={f} />)}</g>
    </svg>
  );
}
export const OWNER = 'Vaibhav Barot';
