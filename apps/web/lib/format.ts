export const inr = (value?: number | string | null, compact = false): string => {
  const amount = Number(value ?? 0);
  if (!amount) return '—';
  if (compact) {
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(amount % 10000000 === 0 ? 0 : 2)} Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(amount % 100000 === 0 ? 0 : 2)} L`;
    if (amount >= 1000) return `₹${(amount / 1000).toFixed(amount % 1000 === 0 ? 0 : 1)}k`;
  }
  return `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
};

export const shortDate = (value?: string | Date | null): string =>
  value ? new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export const dateTime = (value?: string | Date | null): string =>
  value
    ? new Date(value).toLocaleString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
      })
    : '—';

export const relative = (value?: string | Date | null): string => {
  if (!value) return '—';
  const diff = Date.now() - new Date(value).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
};

export const titleCase = (value?: string | null): string =>
  (value ?? '')
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

/** Media keys are private storage paths, not URLs. Demo keys have no file behind them. */
export const mediaUrl = (key?: string | null): string | null =>
  key ? (key.startsWith('demo/') ? null : `/api/media/${encodeURIComponent(key)}`) : null;
